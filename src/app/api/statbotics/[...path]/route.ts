import { NextRequest, NextResponse } from "next/server";
import {
  EMPTY_EPA_RESPONSE,
  getTeam,
  isEmptyPayload,
  proxyStatboticsRequest,
  statboticsFetchOrNull,
  teamPayloadFromOverall,
  type QueryParams,
} from "@/lib/api/statbotics-client";
import {
  extractEpaValue,
  extractWinRate,
  hasUsableEpaMetrics,
  yearFromEventKey,
} from "@/lib/api/statbotics-metrics";
import { parseForceRefreshParams } from "@/lib/cache/force-refresh";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function emptyEpaJson(extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    {
      ...EMPTY_EPA_RESPONSE,
      ...extra,
    },
    { status: 200 },
  );
}

function parseTeamNumber(value: string | undefined): number | null {
  if (!value) return null;
  const team = Number.parseInt(value, 10);
  return Number.isFinite(team) && team > 0 ? team : null;
}

function withNormalizedMetrics(
  payload: Record<string, unknown>,
  fallback: string,
): Record<string, unknown> {
  return {
    ...payload,
    epa: extractEpaValue(payload) ?? null,
    win_rate: extractWinRate(payload) ?? null,
    _fallback: fallback,
  };
}

/**
 * Resolve team metrics with cascading fallbacks:
 * event-specific → team_year (season) → overall /team/{n}
 *
 * Event payloads that exist but have null/N/A EPA do NOT short-circuit —
 * we always continue to `/v3/team_year/{team}/{year}` so EPA/win rate populate.
 */
async function resolveTeamMetrics(options: {
  team: number;
  eventKey?: string;
  year?: number;
  bypassCache?: boolean;
}): Promise<Record<string, unknown>> {
  const { team, eventKey, bypassCache } = options;
  const year =
    options.year ?? yearFromEventKey(eventKey) ?? undefined;
  const fetchOpts = { bypassCache };

  if (eventKey) {
    const eventData =
      (await statboticsFetchOrNull<Record<string, unknown>>(
        `/team_event/${team}/${eventKey}`,
        undefined,
        fetchOpts,
      )) ??
      (
        await statboticsFetchOrNull<Record<string, unknown>[]>(
          "/team_events",
          {
            team,
            event: eventKey,
            limit: 1,
          },
          fetchOpts,
        )
      )?.[0];

    if (
      eventData &&
      !isEmptyPayload(eventData) &&
      hasUsableEpaMetrics(eventData)
    ) {
      console.log("[Statbotics proxy] using team_event data", {
        team,
        eventKey,
        epa: extractEpaValue(eventData),
      });
      return withNormalizedMetrics(eventData, "event");
    }

    console.warn(
      "[Statbotics proxy] event EPA null/N/A; falling back to team_year season endpoint",
      {
        team,
        eventKey,
        year,
        hadPayload: Boolean(eventData && !isEmptyPayload(eventData)),
      },
    );
  }

  if (year) {
    const yearData =
      (await statboticsFetchOrNull<Record<string, unknown>>(
        `/team_year/${team}/${year}`,
        undefined,
        fetchOpts,
      )) ??
      (
        await statboticsFetchOrNull<Record<string, unknown>[]>(
          "/team_years",
          {
            team,
            year,
            limit: 1,
          },
          fetchOpts,
        )
      )?.[0];

    if (
      yearData &&
      !isEmptyPayload(yearData) &&
      hasUsableEpaMetrics(yearData)
    ) {
      console.log("[Statbotics proxy] using team_year season data", {
        team,
        year,
        epa: extractEpaValue(yearData),
      });
      return withNormalizedMetrics(yearData, "team-year");
    }

    console.warn(
      "[Statbotics proxy] team_year EPA missing; falling back to overall team",
      { team, year },
    );
  }

  const overall = await getTeam(team, fetchOpts);
  if (overall && hasUsableEpaMetrics(overall)) {
    console.log("[Statbotics proxy] using overall team endpoint", { team });
    return teamPayloadFromOverall(overall);
  }

  console.warn("[Statbotics proxy] no Statbotics data available", {
    team,
    eventKey,
    year,
  });
  return {
    ...EMPTY_EPA_RESPONSE,
    team,
    event: eventKey ?? null,
    year: year ?? null,
    _fallback: "none",
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const segments = path;
  const statboticsPath = `/${segments.join("/")}`;
  const rawParams = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  ) as QueryParams;
  const { bypassCache } = parseForceRefreshParams(request.nextUrl.searchParams);
  const params = { ...rawParams };
  delete params.force;
  delete params.cache;
  const requestedUrl = `${statboticsPath}${request.nextUrl.search}`;
  const fetchOpts = { bypassCache };

  console.log("[Statbotics proxy] request", {
    path: statboticsPath,
    query: params,
    requestedUrl,
    bypassCache,
  });

  try {
    // GET /api/statbotics/team/{teamNumber}
    if (segments[0] === "team" && segments.length === 2) {
      const team = parseTeamNumber(segments[1]);
      if (!team) {
        return emptyEpaJson({ error: "Invalid team number", path: statboticsPath });
      }

      const overall = await getTeam(team, fetchOpts);
      if (!overall) {
        console.warn("[Statbotics proxy] team lookup empty/failed", { team });
        return emptyEpaJson({ team, _fallback: "none" });
      }

      return NextResponse.json(teamPayloadFromOverall(overall), {
        status: 200,
        headers: bypassCache
          ? { "Cache-Control": "no-store" }
          : undefined,
      });
    }

    // GET /api/statbotics/team_event/{team}/{eventKey}
    if (segments[0] === "team_event" && segments.length === 3) {
      const team = parseTeamNumber(segments[1]);
      const eventKey = segments[2];
      if (!team || !eventKey) {
        return emptyEpaJson({ error: "Invalid team_event path" });
      }

      const year = Number.parseInt(eventKey.slice(0, 4), 10);
      const payload = await resolveTeamMetrics({
        team,
        eventKey,
        year: Number.isFinite(year) ? year : undefined,
        bypassCache,
      });
      return NextResponse.json(payload, {
        status: 200,
        headers: bypassCache
          ? { "Cache-Control": "no-store" }
          : undefined,
      });
    }

    // GET /api/statbotics/team_year/{team}/{year}
    if (segments[0] === "team_year" && segments.length === 3) {
      const team = parseTeamNumber(segments[1]);
      const year = Number.parseInt(segments[2] ?? "", 10);
      if (!team || !Number.isFinite(year)) {
        return emptyEpaJson({ error: "Invalid team_year path" });
      }

      const payload = await resolveTeamMetrics({ team, year, bypassCache });
      return NextResponse.json(payload, {
        status: 200,
        headers: bypassCache
          ? { "Cache-Control": "no-store" }
          : undefined,
      });
    }

    // GET /api/statbotics/team_events?team=&event=&year=
    if (segments[0] === "team_events" && segments.length === 1) {
      const team = parseTeamNumber(String(params.team ?? ""));
      const eventKey =
        typeof params.event === "string" && params.event ? params.event : undefined;
      const yearParam = params.year ? Number(params.year) : undefined;
      const year =
        yearParam && Number.isFinite(yearParam)
          ? yearParam
          : eventKey
            ? Number.parseInt(eventKey.slice(0, 4), 10)
            : undefined;

      if (team && (eventKey || year)) {
        const payload = await resolveTeamMetrics({
          team,
          eventKey,
          year: Number.isFinite(year) ? year : undefined,
          bypassCache,
        });
        // Preserve array shape expected by list consumers, with metrics embedded.
        return NextResponse.json([payload], {
          status: 200,
          headers: bypassCache
            ? { "Cache-Control": "no-store" }
            : undefined,
        });
      }

      if (team) {
        const overall = await getTeam(team, fetchOpts);
        if (overall) {
          return NextResponse.json([teamPayloadFromOverall(overall)], {
            status: 200,
            headers: bypassCache
              ? { "Cache-Control": "no-store" }
              : undefined,
          });
        }
        return NextResponse.json(
          [{ ...EMPTY_EPA_RESPONSE, team, _fallback: "none" }],
          { status: 200 },
        );
      }

      const rows = await statboticsFetchOrNull<unknown[]>(
        "/team_events",
        params,
        fetchOpts,
      );
      return NextResponse.json(rows ?? [], { status: 200 });
    }

    // Generic passthrough for other Statbotics paths — never 500 on upstream miss.
    try {
      const data = await proxyStatboticsRequest(
        statboticsPath,
        params,
        fetchOpts,
      );
      if (isEmptyPayload(data)) {
        console.warn("[Statbotics proxy] empty upstream payload", { requestedUrl });
        if (statboticsPath.includes("team")) {
          return emptyEpaJson({ path: statboticsPath, _fallback: "none" });
        }
        return NextResponse.json(Array.isArray(data) ? [] : {}, { status: 200 });
      }
      return NextResponse.json(data, {
        status: 200,
        headers: bypassCache
          ? { "Cache-Control": "no-store" }
          : undefined,
      });
    } catch (error) {
      console.warn("[Statbotics proxy] upstream failure degraded to empty 200", {
        requestedUrl,
        error: error instanceof Error ? error.message.slice(0, 300) : error,
      });
      if (statboticsPath.includes("team")) {
        return emptyEpaJson({
          path: statboticsPath,
          _fallback: "none",
          upstream_error: true,
        });
      }
      return NextResponse.json([], { status: 200 });
    }
  } catch (error) {
    // Absolute last resort: never crash the route with a 500 for Statbotics issues.
    console.error("[Statbotics proxy] caught unexpected error; returning empty 200", {
      requestedUrl,
      error,
    });
    return emptyEpaJson({
      path: statboticsPath,
      _fallback: "none",
      upstream_error: true,
    });
  }
}

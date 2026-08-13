import type {
  StatboticsEvent,
  StatboticsTeam,
  StatboticsTeamEvent,
  StatboticsTeamYear,
} from "@/lib/types/statbotics";
import {
  extractStatboticsMetrics,
  hasUsableEpaMetrics,
} from "@/lib/api/statbotics-metrics";

export class BrowserApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
    this.name = "BrowserApiError";
  }
}

async function fetchJson<T>(
  url: string,
  label = "API",
  options?: { force?: boolean; bypassCache?: boolean },
): Promise<T> {
  const finalUrl =
    options?.force || options?.bypassCache
      ? (() => {
          const parsed = new URL(url, "http://localhost");
          if (options.force) parsed.searchParams.set("force", "true");
          else if (options.bypassCache) parsed.searchParams.set("cache", "false");
          return `${parsed.pathname}${parsed.search}`;
        })()
      : url;

  console.log(`[${label}] request`, finalUrl);

  try {
    const response = await fetch(finalUrl, {
      cache: options?.force || options?.bypassCache ? "no-store" : "default",
    });
    console.log(`[${label}] response`, {
      url: finalUrl,
      status: response.status,
      statusText: response.statusText,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        (errorBody as { error?: string }).error ??
        `Request failed: ${response.status} ${response.statusText}`;
      console.error(`[${label}] error`, {
        url: finalUrl,
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new BrowserApiError(message, response.status, finalUrl);
    }

    const data = (await response.json()) as T;
    const empty =
      data == null ||
      (typeof data === "object" && Object.keys(data as object).length === 0);
    if (empty) {
      console.warn(`[${label}] empty payload`, {
        url: finalUrl,
        status: response.status,
      });
    } else {
      console.log(`[${label}] success`, { url: finalUrl, status: response.status });
    }
    return data;
  } catch (error) {
    if (!(error instanceof BrowserApiError)) {
      console.error(`[${label}] network/parse error`, { url: finalUrl, error });
    }
    throw error;
  }
}

function isEmptyPayload(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function extractMetrics(source: Parameters<typeof extractStatboticsMetrics>[0]) {
  return extractStatboticsMetrics(source);
}

function hasUsableMetrics(value: unknown): boolean {
  if (isEmptyPayload(value)) return false;
  return hasUsableEpaMetrics(value);
}

export function fetchStatboticsTeam(
  teamNumber: number,
  options?: { force?: boolean },
) {
  return fetchJson<StatboticsTeam | Record<string, never>>(
    `/api/statbotics/team/${teamNumber}`,
    "Statbotics",
    options,
  );
}

export function fetchStatboticsTeamEvent(
  teamNumber: number,
  eventKey: string,
  options?: { force?: boolean },
) {
  return fetchJson<StatboticsTeamEvent | Record<string, never>>(
    `/api/statbotics/team_event/${teamNumber}/${eventKey}`,
    "Statbotics",
    options,
  );
}

export function fetchStatboticsTeamYear(
  teamNumber: number,
  year: number,
  options?: { force?: boolean },
) {
  return fetchJson<StatboticsTeamYear | Record<string, never>>(
    `/api/statbotics/team_year/${teamNumber}/${year}`,
    "Statbotics",
    options,
  );
}

export function fetchStatboticsTeamEvents(params: {
  team?: number;
  year?: number;
  event?: string;
}) {
  const search = new URLSearchParams();
  if (params.team !== undefined) search.set("team", String(params.team));
  if (params.year !== undefined) search.set("year", String(params.year));
  if (params.event !== undefined) search.set("event", params.event);
  const query = search.toString();
  return fetchJson<StatboticsTeamEvent[]>(
    `/api/statbotics/team_events${query ? `?${query}` : ""}`,
    "Statbotics",
  );
}

export function fetchStatboticsEvent(eventKey: string) {
  return fetchJson<StatboticsEvent | Record<string, never>>(
    `/api/statbotics/event/${eventKey}`,
    "Statbotics",
  );
}

export function fetchStatboticsEvents(year: number) {
  return fetchJson<StatboticsEvent[]>(
    `/api/statbotics/events?year=${year}`,
    "Statbotics",
  );
}

export interface TeamComparisonStatboticsMetrics {
  team: number;
  eventKey: string;
  year: number;
  nickname?: string;
  epa?: number;
  winrate?: number;
  auto?: number;
  teleop?: number;
  endgame?: number;
  /** Where metrics came from after empty/null/404 fallback handling. */
  source: "event" | "team-year" | "team-overall" | "none";
}

/**
 * Comparison metrics with cascading Statbotics v3 lookups:
 * 1) `/v3/team_event/{team}/{event_key}`
 * 2) `/v3/team_year/{team}/{year}` (season averages)
 * 3) `/v3/team/{team}` overall career/current EPA
 */
export async function fetchStatboticsComparisonMetrics(params: {
  team: number;
  eventKey: string;
  year: number;
  force?: boolean;
}): Promise<TeamComparisonStatboticsMetrics> {
  const { team, eventKey, year, force } = params;
  const fetchOpts = force ? { force: true } : undefined;
  const base: TeamComparisonStatboticsMetrics = {
    team,
    eventKey,
    year,
    source: "none",
  };

  console.log("[Compare/Statbotics] cascade start", { team, eventKey, year, force });

  // 1) Event-specific (proxy already falls back to /team/{n} server-side)
  try {
    const eventData = await fetchStatboticsTeamEvent(team, eventKey, fetchOpts);
    if (hasUsableMetrics(eventData)) {
      const row = eventData as StatboticsTeamEvent & {
        name?: string;
        win_rate?: number | null;
        _fallback?: string;
      };
      const metrics = extractMetrics(row);
      const source =
        row._fallback === "team"
          ? "team-overall"
          : row._fallback === "team-year"
            ? "team-year"
            : "event";
      console.log("[Compare/Statbotics] using team_event response", {
        team,
        eventKey,
        epa: metrics.epa,
        source,
      });
      return {
        ...base,
        nickname: metrics.nickname ?? row.name,
        epa: metrics.epa,
        winrate: metrics.winrate,
        auto: metrics.auto,
        teleop: metrics.teleop,
        endgame: metrics.endgame,
        source,
      };
    }
    console.warn(
      "[Compare/Statbotics] team_event returned without usable EPA; falling back to team_year",
      { team, eventKey, eventData },
    );
  } catch (error) {
    const status = error instanceof BrowserApiError ? error.status : undefined;
    console.warn("[Compare/Statbotics] team_event failed; falling back to team_year", {
      team,
      eventKey,
      status,
      url: error instanceof BrowserApiError ? error.url : undefined,
      error,
    });
  }

  // 2) Season averages
  try {
    const yearData = await fetchStatboticsTeamYear(team, year, fetchOpts);
    if (hasUsableMetrics(yearData)) {
      const row = yearData as StatboticsTeamYear & {
        win_rate?: number | null;
        _fallback?: string;
      };
      const metrics = extractMetrics(row);
      const source =
        row._fallback === "team" ? "team-overall" : "team-year";
      console.log("[Compare/Statbotics] using team_year season averages", {
        team,
        year,
        epa: metrics.epa,
        source,
      });
      return {
        ...base,
        nickname: row.name,
        epa: metrics.epa,
        winrate: metrics.winrate,
        auto: metrics.auto,
        teleop: metrics.teleop,
        endgame: metrics.endgame,
        source,
      };
    }
    console.warn(
      "[Compare/Statbotics] team_year returned without usable EPA; falling back to overall team",
      { team, year, yearData },
    );
  } catch (error) {
    const status = error instanceof BrowserApiError ? error.status : undefined;
    console.warn("[Compare/Statbotics] team_year failed; falling back to overall team", {
      team,
      year,
      status,
      url: error instanceof BrowserApiError ? error.url : undefined,
      error,
    });
  }

  // 3) Overall team
  try {
    const teamData = await fetchStatboticsTeam(team, fetchOpts);
    if (!hasUsableMetrics(teamData)) {
      console.warn("[Compare/Statbotics] overall team empty", { team, teamData });
      return base;
    }

    const overall = teamData as StatboticsTeam & {
      name?: string;
      win_rate?: number | null;
    };
    const metrics = extractMetrics(overall);
    console.log("[Compare/Statbotics] using overall team", {
      team,
      epa: metrics.epa,
    });
    return {
      ...base,
      nickname: overall.name,
      epa: metrics.epa,
      winrate: metrics.winrate,
      auto: metrics.auto,
      teleop: metrics.teleop,
      endgame: metrics.endgame,
      source: "team-overall",
    };
  } catch (error) {
    console.error("[Compare/Statbotics] overall team failed", {
      team,
      status: error instanceof BrowserApiError ? error.status : undefined,
      url: error instanceof BrowserApiError ? error.url : undefined,
      error,
    });
    return base;
  }
}

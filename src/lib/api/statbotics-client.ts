import type {
  StatboticsEvent,
  StatboticsMatch,
  StatboticsTeam,
  StatboticsTeamEvent,
  StatboticsTeamYear,
} from "@/lib/types/statbotics";

const STATBOTICS_BASE_URL = "https://api.statbotics.io/v3";
const STATBOTICS_USER_AGENT = "FRC-Scouting-App/1.0";

export class StatboticsApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public path: string,
    public url?: string,
  ) {
    super(message);
    this.name = "StatboticsApiError";
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

export const EMPTY_EPA_RESPONSE = {
  epa: null,
  win_rate: null,
} as const;

function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function isEmptyPayload(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/**
 * Low-level Statbotics fetch. Throws StatboticsApiError on non-OK responses.
 * Callers should catch and degrade gracefully for missing 2026 data.
 */
export async function statboticsFetch<T>(
  path: string,
  params?: QueryParams,
  options?: { bypassCache?: boolean },
): Promise<T> {
  const filteredParams = { ...params };
  // Strip local cache-control flags so they are not forwarded upstream.
  delete filteredParams.force;
  delete filteredParams.cache;

  const url = `${STATBOTICS_BASE_URL}${path.startsWith("/") ? path : `/${path}`}${buildQuery(filteredParams)}`;
  console.log("[Statbotics] GET", url, {
    bypassCache: Boolean(options?.bypassCache),
  });

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": STATBOTICS_USER_AGENT,
      },
      ...(options?.bypassCache
        ? { cache: "no-store" as const }
        : { next: { revalidate: 300 } }),
    });
  } catch (error) {
    console.error("[Statbotics] network error", { url, error });
    throw new StatboticsApiError(
      error instanceof Error ? error.message : "Network error contacting Statbotics",
      502,
      path,
      url,
    );
  }

  console.log("[Statbotics] response", {
    url,
    status: response.status,
    statusText: response.statusText,
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("[Statbotics] error", {
      url,
      status: response.status,
      body: body.slice(0, 500),
    });
    throw new StatboticsApiError(
      body || `Statbotics request failed with status ${response.status}`,
      response.status,
      path,
      url,
    );
  }

  const data = (await response.json()) as T;
  if (isEmptyPayload(data)) {
    console.warn("[Statbotics] empty payload", { url, status: response.status });
  }
  return data;
}

/** Safe fetch that returns null on any upstream failure or empty body. */
export async function statboticsFetchOrNull<T>(
  path: string,
  params?: QueryParams,
  options?: { bypassCache?: boolean },
): Promise<T | null> {
  try {
    const data = await statboticsFetch<T>(path, params, options);
    return isEmptyPayload(data) ? null : data;
  } catch (error) {
    console.warn("[Statbotics] safe fetch failed", {
      path,
      params,
      status: error instanceof StatboticsApiError ? error.status : undefined,
      message: error instanceof Error ? error.message.slice(0, 200) : error,
    });
    return null;
  }
}

export async function getTeam(
  teamNumber: number,
  options?: { bypassCache?: boolean },
): Promise<StatboticsTeam | null> {
  return statboticsFetchOrNull<StatboticsTeam>(
    `/team/${teamNumber}`,
    undefined,
    options,
  );
}

export async function getTeamEvents(params: {
  team?: number;
  year?: number;
  event?: string;
  limit?: number;
  metric?: string;
  ascending?: boolean;
}): Promise<StatboticsTeamEvent[]> {
  const data = await statboticsFetchOrNull<StatboticsTeamEvent[]>(
    "/team_events",
    params,
  );
  return data ?? [];
}

/** Prefer path form: `/v3/team_event/{team}/{event_key}` */
export async function getTeamEvent(
  teamNumber: number,
  eventKey: string,
): Promise<StatboticsTeamEvent | null> {
  const direct = await statboticsFetchOrNull<StatboticsTeamEvent>(
    `/team_event/${teamNumber}/${eventKey}`,
  );
  if (direct) return direct;

  const rows = await getTeamEvents({
    team: teamNumber,
    event: eventKey,
    limit: 1,
  });
  return rows[0] ?? null;
}

/** Prefer path form: `/v3/team_year/{team}/{year}` */
export async function getTeamYear(
  teamNumber: number,
  year: number,
): Promise<StatboticsTeamYear | null> {
  const direct = await statboticsFetchOrNull<StatboticsTeamYear>(
    `/team_year/${teamNumber}/${year}`,
  );
  if (direct) return direct;

  const rows = await statboticsFetchOrNull<StatboticsTeamYear[]>("/team_years", {
    team: teamNumber,
    year,
    limit: 1,
  });
  return rows?.[0] ?? null;
}

export async function getEvent(eventKey: string): Promise<StatboticsEvent | null> {
  return statboticsFetchOrNull<StatboticsEvent>(`/event/${eventKey}`);
}

export async function getEvents(year: number): Promise<StatboticsEvent[]> {
  const data = await statboticsFetchOrNull<StatboticsEvent[]>("/events", { year });
  return data ?? [];
}

export async function getEventMatches(eventKey: string): Promise<StatboticsMatch[]> {
  const data = await statboticsFetchOrNull<StatboticsMatch[]>("/matches", {
    event: eventKey,
  });
  return data ?? [];
}

export async function proxyStatboticsRequest(
  path: string,
  params?: QueryParams,
  options?: { bypassCache?: boolean },
): Promise<unknown> {
  return statboticsFetch<unknown>(path, params, options);
}

export function teamPayloadFromOverall(
  team: StatboticsTeam,
): Record<string, unknown> {
  const epa = team.norm_epa?.current ?? team.norm_epa?.mean ?? null;
  return {
    ...team,
    epa,
    win_rate: team.record?.winrate ?? null,
    _fallback: "team",
  };
}

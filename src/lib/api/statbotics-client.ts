import type {
  StatboticsEvent,
  StatboticsMatch,
  StatboticsTeam,
  StatboticsTeamEvent,
  StatboticsTeamYear,
} from "@/lib/types/statbotics";

const STATBOTICS_BASE_URL = "https://api.statbotics.io/v3";

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

type QueryParams = Record<string, string | number | boolean | undefined>;

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

function isEmptyPayload(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

async function statboticsFetch<T>(
  path: string,
  params?: QueryParams,
): Promise<T> {
  const url = `${STATBOTICS_BASE_URL}${path.startsWith("/") ? path : `/${path}`}${buildQuery(params)}`;
  console.log("[Statbotics] GET", url);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });

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

export async function getTeam(teamNumber: number): Promise<StatboticsTeam | null> {
  const data = await statboticsFetch<StatboticsTeam | Record<string, never>>(
    `/team/${teamNumber}`,
  );
  return isEmptyPayload(data) ? null : (data as StatboticsTeam);
}

export async function getTeamEvents(params: {
  team?: number;
  year?: number;
  event?: string;
  limit?: number;
  metric?: string;
  ascending?: boolean;
}): Promise<StatboticsTeamEvent[]> {
  return statboticsFetch<StatboticsTeamEvent[]>("/team_events", params);
}

/** Prefer path form: `/v3/team_event/{team}/{event_key}` */
export async function getTeamEvent(
  teamNumber: number,
  eventKey: string,
): Promise<StatboticsTeamEvent | null> {
  try {
    const data = await statboticsFetch<StatboticsTeamEvent | Record<string, never>>(
      `/team_event/${teamNumber}/${eventKey}`,
    );
    if (!isEmptyPayload(data)) {
      return data as StatboticsTeamEvent;
    }
  } catch (error) {
    if (!(error instanceof StatboticsApiError) || (error.status !== 404 && error.status !== 204)) {
      console.warn(
        `[Statbotics] team_event path failed for ${teamNumber}/${eventKey}; trying query fallback`,
        error instanceof StatboticsApiError
          ? { status: error.status, url: error.url }
          : error,
      );
    }
  }

  try {
    const rows = await getTeamEvents({
      team: teamNumber,
      event: eventKey,
      limit: 1,
    });
    return rows[0] ?? null;
  } catch (error) {
    console.error(
      `[Statbotics] team_events query fallback failed for ${teamNumber}/${eventKey}`,
      error,
    );
    return null;
  }
}

/** Prefer path form: `/v3/team_year/{team}/{year}` */
export async function getTeamYear(
  teamNumber: number,
  year: number,
): Promise<StatboticsTeamYear | null> {
  try {
    const data = await statboticsFetch<StatboticsTeamYear | Record<string, never>>(
      `/team_year/${teamNumber}/${year}`,
    );
    if (!isEmptyPayload(data)) {
      return data as StatboticsTeamYear;
    }
  } catch (error) {
    if (!(error instanceof StatboticsApiError) || (error.status !== 404 && error.status !== 204)) {
      console.warn(
        `[Statbotics] team_year path failed for ${teamNumber}/${year}; trying query fallback`,
        error instanceof StatboticsApiError
          ? { status: error.status, url: error.url }
          : error,
      );
    }
  }

  try {
    const rows = await statboticsFetch<StatboticsTeamYear[]>("/team_years", {
      team: teamNumber,
      year,
      limit: 1,
    });
    return rows[0] ?? null;
  } catch (error) {
    console.error(
      `[Statbotics] team_years query fallback failed for ${teamNumber}/${year}`,
      error,
    );
    return null;
  }
}

export async function getEvent(eventKey: string): Promise<StatboticsEvent | null> {
  const data = await statboticsFetch<StatboticsEvent | Record<string, never>>(
    `/event/${eventKey}`,
  );
  return isEmptyPayload(data) ? null : (data as StatboticsEvent);
}

export async function getEvents(year: number): Promise<StatboticsEvent[]> {
  return statboticsFetch<StatboticsEvent[]>("/events", { year });
}

export async function getEventMatches(eventKey: string): Promise<StatboticsMatch[]> {
  return statboticsFetch<StatboticsMatch[]>("/matches", { event: eventKey });
}

export async function proxyStatboticsRequest(
  path: string,
  params?: QueryParams,
): Promise<unknown> {
  return statboticsFetch<unknown>(path, params);
}

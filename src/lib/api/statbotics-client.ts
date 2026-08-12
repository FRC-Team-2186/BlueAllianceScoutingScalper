import type {
  StatboticsEvent,
  StatboticsMatch,
  StatboticsTeam,
  StatboticsTeamEvent,
} from "@/lib/types/statbotics";

const STATBOTICS_BASE_URL = "https://api.statbotics.io/v3";

export class StatboticsApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public path: string,
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

async function statboticsFetch<T>(
  path: string,
  params?: QueryParams,
): Promise<T> {
  const url = `${STATBOTICS_BASE_URL}${path.startsWith("/") ? path : `/${path}`}${buildQuery(params)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new StatboticsApiError(
      body || `Statbotics request failed with status ${response.status}`,
      response.status,
      path,
    );
  }

  return (await response.json()) as T;
}

export async function getTeam(teamNumber: number): Promise<StatboticsTeam | null> {
  const data = await statboticsFetch<StatboticsTeam | Record<string, never>>(
    `/team/${teamNumber}`,
  );
  return Object.keys(data).length === 0 ? null : (data as StatboticsTeam);
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

export async function getTeamEvent(
  teamNumber: number,
  eventKey: string,
): Promise<StatboticsTeamEvent | null> {
  const rows = await getTeamEvents({ team: teamNumber, event: eventKey, limit: 1 });
  return rows[0] ?? null;
}

export async function getEvent(eventKey: string): Promise<StatboticsEvent | null> {
  const data = await statboticsFetch<StatboticsEvent | Record<string, never>>(
    `/event/${eventKey}`,
  );
  return Object.keys(data).length === 0 ? null : (data as StatboticsEvent);
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

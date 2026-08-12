import { sortMatchesChronologically } from "@/lib/api/match-sort";
import type {
  TbaEvent,
  TbaMatch,
  TbaTeam,
  TbaTeamEventStatus,
} from "@/lib/types/tba";

const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

export class TbaApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public path: string,
  ) {
    super(message);
    this.name = "TbaApiError";
  }
}

function getTbaApiKey(): string {
  const key = process.env.TBA_API_KEY?.trim();
  if (!key) {
    throw new TbaApiError(
      "TBA_API_KEY is not configured. Add it to .env.local or use mock endpoints.",
      503,
      "",
    );
  }
  return key;
}

async function tbaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${TBA_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  console.log("[TBA] GET", url);

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "X-TBA-Auth-Key": getTbaApiKey(),
      ...(init?.headers ?? {}),
    },
    next: { revalidate: 300 },
  });

  console.log("[TBA] response", {
    url,
    status: response.status,
    statusText: response.statusText,
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("[TBA] error", {
      url,
      status: response.status,
      body: body.slice(0, 500),
    });
    throw new TbaApiError(
      body || `TBA request failed with status ${response.status}`,
      response.status,
      path,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getTeam(teamKey: string): Promise<TbaTeam> {
  return tbaFetch<TbaTeam>(`/team/${teamKey}`);
}

export async function getTeamEvents(
  teamKey: string,
  year: number,
): Promise<TbaEvent[]> {
  return tbaFetch<TbaEvent[]>(`/team/${teamKey}/events/${year}`);
}

export async function getTeamEventMatches(
  teamKey: string,
  eventKey: string,
): Promise<TbaMatch[]> {
  const matches = await tbaFetch<TbaMatch[]>(
    `/team/${teamKey}/event/${eventKey}/matches`,
  );
  return sortMatchesChronologically(matches);
}

export async function getTeamEventStatus(
  teamKey: string,
  eventKey: string,
): Promise<TbaTeamEventStatus> {
  return tbaFetch<TbaTeamEventStatus>(
    `/team/${teamKey}/event/${eventKey}/status`,
  );
}

export async function getEvent(eventKey: string): Promise<TbaEvent> {
  return tbaFetch<TbaEvent>(`/event/${eventKey}`);
}

export async function getEventMatches(eventKey: string): Promise<TbaMatch[]> {
  const matches = await tbaFetch<TbaMatch[]>(`/event/${eventKey}/matches`);
  return sortMatchesChronologically(matches);
}

export async function getMatch(matchKey: string): Promise<TbaMatch> {
  return tbaFetch<TbaMatch>(`/match/${matchKey}`);
}

export async function getEventsByYear(year: number): Promise<TbaEvent[]> {
  return tbaFetch<TbaEvent[]>(`/events/${year}`);
}

export async function proxyTbaRequest(path: string): Promise<unknown> {
  return tbaFetch<unknown>(path);
}

import type { TbaEvent, TbaMatch, TbaTeam, TbaTeamEventStatus } from "@/lib/types/tba";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: string }).error ??
        `Request failed: ${response.status} ${response.statusText}`,
    );
  }
  return response.json() as Promise<T>;
}

export function fetchTbaTeam(teamKey: string) {
  return fetchJson<TbaTeam>(`/api/tba/team/${teamKey}`);
}

export function fetchTbaTeamEvents(teamKey: string, year: number) {
  return fetchJson<TbaEvent[]>(`/api/tba/team/${teamKey}/events/${year}`);
}

export function fetchTbaTeamEventMatches(teamKey: string, eventKey: string) {
  return fetchJson<TbaMatch[]>(
    `/api/tba/team/${teamKey}/event/${eventKey}/matches`,
  );
}

export function fetchTbaTeamEventStatus(teamKey: string, eventKey: string) {
  return fetchJson<TbaTeamEventStatus>(
    `/api/tba/team/${teamKey}/event/${eventKey}/status`,
  );
}

export function fetchTbaEvent(eventKey: string) {
  return fetchJson<TbaEvent>(`/api/tba/event/${eventKey}`);
}

export function fetchTbaMatch(matchKey: string) {
  return fetchJson<TbaMatch>(`/api/tba/match/${matchKey}`);
}

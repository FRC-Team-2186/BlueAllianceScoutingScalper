import type {
  StatboticsEvent,
  StatboticsTeam,
  StatboticsTeamEvent,
} from "@/lib/types/statbotics";

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

export function fetchStatboticsTeam(teamNumber: number) {
  return fetchJson<StatboticsTeam | Record<string, never>>(
    `/api/statbotics/team/${teamNumber}`,
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
  );
}

export function fetchStatboticsEvent(eventKey: string) {
  return fetchJson<StatboticsEvent | Record<string, never>>(
    `/api/statbotics/event/${eventKey}`,
  );
}

export function fetchStatboticsEvents(year: number) {
  return fetchJson<StatboticsEvent[]>(`/api/statbotics/events?year=${year}`);
}

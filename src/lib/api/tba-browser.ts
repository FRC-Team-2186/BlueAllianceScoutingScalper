import type { TbaEvent, TbaMatch, TbaTeam, TbaTeamEventStatus } from "@/lib/types/tba";
import { filterOfficialEvents } from "@/lib/tba/official-events";

export class TbaBrowserApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
    this.name = "TbaBrowserApiError";
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  console.log("[TBA] request", url);

  try {
    const response = await fetch(url);
    console.log("[TBA] response", {
      url,
      status: response.status,
      statusText: response.statusText,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const message =
        (error as { error?: string }).error ??
        `Request failed: ${response.status} ${response.statusText}`;
      console.error("[TBA] error", {
        url,
        status: response.status,
        statusText: response.statusText,
        body: error,
      });
      throw new TbaBrowserApiError(message, response.status, url);
    }

    const data = (await response.json()) as T;
    console.log("[TBA] success", {
      url,
      status: response.status,
      itemCount: Array.isArray(data) ? data.length : undefined,
    });
    return data;
  } catch (error) {
    if (!(error instanceof TbaBrowserApiError)) {
      console.error("[TBA] network/parse error", { url, error });
    }
    throw error;
  }
}

export function fetchTbaTeam(teamKey: string) {
  return fetchJson<TbaTeam>(`/api/tba/team/${teamKey}`);
}

export async function fetchTbaTeamEvents(teamKey: string, year: number) {
  const events = await fetchJson<TbaEvent[]>(
    `/api/tba/team/${teamKey}/events/${year}`,
  );
  return filterOfficialEvents(events);
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

import type {
  StatboticsEvent,
  StatboticsTeam,
  StatboticsTeamEvent,
} from "@/lib/types/statbotics";

async function fetchJson<T>(url: string): Promise<T> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        (errorBody as { error?: string }).error ??
        `Request failed: ${response.status} ${response.statusText}`;
      console.error("[Statbotics API]", url, response.status, message, errorBody);
      const error = new Error(message) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (!(error instanceof Error && "status" in error)) {
      console.error("[Statbotics API] network/parse error", url, error);
    }
    throw error;
  }
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
  /** Where EPA came from after empty/null event fallback handling. */
  source: "event" | "team-overall" | "none";
}

function isEmptyPayload(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * Prefer event-specific Statbotics EPA; fall back to overall team EPA when the
 * event endpoint returns empty/`null`/404 (common early in a season).
 */
export async function fetchStatboticsComparisonMetrics(params: {
  team: number;
  eventKey: string;
  year: number;
}): Promise<TeamComparisonStatboticsMetrics> {
  const { team, eventKey, year } = params;
  const base: TeamComparisonStatboticsMetrics = {
    team,
    eventKey,
    year,
    source: "none",
  };

  let eventRow: StatboticsTeamEvent | null = null;

  try {
    const eventRows = await fetchStatboticsTeamEvents({ team, event: eventKey });
    if (!isEmptyPayload(eventRows)) {
      eventRow = eventRows[0] ?? null;
    } else {
      console.warn(
        `[Statbotics] Empty event EPA for team ${team} @ ${eventKey}; falling back to overall team EPA`,
      );
    }
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404 || status === 204) {
      console.warn(
        `[Statbotics] Event EPA ${status} for team ${team} @ ${eventKey}; falling back to overall team EPA`,
      );
    } else {
      console.error(
        `[Statbotics] Event EPA error for team ${team} @ ${eventKey}`,
        error,
      );
    }
  }

  if (eventRow) {
    const epa = eventRow.norm_epa?.mean ?? eventRow.epa?.mean;
    if (epa != null && Number.isFinite(epa)) {
      return {
        ...base,
        nickname: eventRow.name,
        epa,
        winrate: eventRow.record?.winrate,
        auto: eventRow.epa?.auto,
        teleop: eventRow.epa?.teleop,
        endgame: eventRow.epa?.endgame,
        source: "event",
      };
    }
    console.warn(
      `[Statbotics] Event row for team ${team} @ ${eventKey} missing EPA; falling back to overall team EPA`,
      eventRow,
    );
  }

  try {
    const teamData = await fetchStatboticsTeam(team);
    if (isEmptyPayload(teamData)) {
      console.warn(`[Statbotics] Overall team EPA empty for team ${team}`);
      return base;
    }

    const overall = teamData as StatboticsTeam;
    return {
      ...base,
      nickname: overall.name,
      epa: overall.norm_epa?.current ?? overall.norm_epa?.mean,
      winrate: overall.record?.winrate,
      source: "team-overall",
    };
  } catch (error) {
    console.error(`[Statbotics] Overall team EPA error for team ${team}`, error);
    return base;
  }
}

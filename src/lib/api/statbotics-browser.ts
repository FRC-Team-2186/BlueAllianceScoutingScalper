import type {
  StatboticsEvent,
  StatboticsTeam,
  StatboticsTeamEvent,
  StatboticsTeamYear,
} from "@/lib/types/statbotics";

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

async function fetchJson<T>(url: string, label = "API"): Promise<T> {
  console.log(`[${label}] request`, url);

  try {
    const response = await fetch(url);
    console.log(`[${label}] response`, {
      url,
      status: response.status,
      statusText: response.statusText,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        (errorBody as { error?: string }).error ??
        `Request failed: ${response.status} ${response.statusText}`;
      console.error(`[${label}] error`, {
        url,
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new BrowserApiError(message, response.status, url);
    }

    const data = (await response.json()) as T;
    const empty =
      data == null ||
      (typeof data === "object" && Object.keys(data as object).length === 0);
    if (empty) {
      console.warn(`[${label}] empty payload`, { url, status: response.status });
    } else {
      console.log(`[${label}] success`, { url, status: response.status });
    }
    return data;
  } catch (error) {
    if (!(error instanceof BrowserApiError)) {
      console.error(`[${label}] network/parse error`, { url, error });
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

function extractEpa(source: {
  norm_epa?: { current?: number; mean?: number };
  epa?: { mean?: number; auto?: number; teleop?: number; endgame?: number };
}): {
  epa?: number;
  auto?: number;
  teleop?: number;
  endgame?: number;
} {
  const epa =
    source.norm_epa?.current ??
    source.norm_epa?.mean ??
    source.epa?.mean;
  return {
    epa: epa != null && Number.isFinite(epa) ? epa : undefined,
    auto: source.epa?.auto,
    teleop: source.epa?.teleop,
    endgame: source.epa?.endgame,
  };
}

export function fetchStatboticsTeam(teamNumber: number) {
  return fetchJson<StatboticsTeam | Record<string, never>>(
    `/api/statbotics/team/${teamNumber}`,
    "Statbotics",
  );
}

export function fetchStatboticsTeamEvent(teamNumber: number, eventKey: string) {
  return fetchJson<StatboticsTeamEvent | Record<string, never>>(
    `/api/statbotics/team_event/${teamNumber}/${eventKey}`,
    "Statbotics",
  );
}

export function fetchStatboticsTeamYear(teamNumber: number, year: number) {
  return fetchJson<StatboticsTeamYear | Record<string, never>>(
    `/api/statbotics/team_year/${teamNumber}/${year}`,
    "Statbotics",
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
}): Promise<TeamComparisonStatboticsMetrics> {
  const { team, eventKey, year } = params;
  const base: TeamComparisonStatboticsMetrics = {
    team,
    eventKey,
    year,
    source: "none",
  };

  console.log("[Compare/Statbotics] cascade start", { team, eventKey, year });

  // 1) Event-specific
  try {
    const eventData = await fetchStatboticsTeamEvent(team, eventKey);
    if (!isEmptyPayload(eventData)) {
      const row = eventData as StatboticsTeamEvent;
      const metrics = extractEpa(row);
      if (metrics.epa != null) {
        console.log("[Compare/Statbotics] using team_event", {
          team,
          eventKey,
          epa: metrics.epa,
        });
        return {
          ...base,
          nickname: row.name,
          epa: metrics.epa,
          winrate: row.record?.winrate,
          auto: metrics.auto,
          teleop: metrics.teleop,
          endgame: metrics.endgame,
          source: "event",
        };
      }
      console.warn(
        "[Compare/Statbotics] team_event returned without EPA; falling back to team_year",
        { team, eventKey, row },
      );
    } else {
      console.warn(
        "[Compare/Statbotics] team_event empty/null; falling back to team_year",
        { team, eventKey },
      );
    }
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
    const yearData = await fetchStatboticsTeamYear(team, year);
    if (!isEmptyPayload(yearData)) {
      const row = yearData as StatboticsTeamYear;
      const metrics = extractEpa(row);
      if (metrics.epa != null) {
        console.log("[Compare/Statbotics] using team_year season averages", {
          team,
          year,
          epa: metrics.epa,
        });
        return {
          ...base,
          nickname: row.name,
          epa: metrics.epa,
          winrate: row.record?.winrate,
          auto: metrics.auto,
          teleop: metrics.teleop,
          endgame: metrics.endgame,
          source: "team-year",
        };
      }
      console.warn(
        "[Compare/Statbotics] team_year returned without EPA; falling back to overall team",
        { team, year, row },
      );
    } else {
      console.warn(
        "[Compare/Statbotics] team_year empty/null; falling back to overall team",
        { team, year },
      );
    }
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
    const teamData = await fetchStatboticsTeam(team);
    if (isEmptyPayload(teamData)) {
      console.warn("[Compare/Statbotics] overall team empty", { team });
      return base;
    }

    const overall = teamData as StatboticsTeam;
    const metrics = extractEpa(overall);
    console.log("[Compare/Statbotics] using overall team", {
      team,
      epa: metrics.epa,
    });
    return {
      ...base,
      nickname: overall.name,
      epa: metrics.epa,
      winrate: overall.record?.winrate,
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

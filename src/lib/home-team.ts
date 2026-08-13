/** Browser localStorage helpers for the scout Home Team setting. */

export const HOME_TEAM_STORAGE_KEY = "homeTeamNumber";
export const DEFAULT_HOME_TEAM_NUMBER = 2186;

export function parseHomeTeamNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value.trim(), 10)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 99999) {
    return null;
  }
  return Math.floor(parsed);
}

export function readHomeTeamNumber(): number {
  if (typeof window === "undefined") {
    return DEFAULT_HOME_TEAM_NUMBER;
  }
  try {
    const stored = window.localStorage.getItem(HOME_TEAM_STORAGE_KEY);
    return parseHomeTeamNumber(stored) ?? DEFAULT_HOME_TEAM_NUMBER;
  } catch {
    return DEFAULT_HOME_TEAM_NUMBER;
  }
}

export function writeHomeTeamNumber(teamNumber: number): number {
  const normalized =
    parseHomeTeamNumber(teamNumber) ?? DEFAULT_HOME_TEAM_NUMBER;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(HOME_TEAM_STORAGE_KEY, String(normalized));
      window.dispatchEvent(
        new CustomEvent("home-team-changed", { detail: normalized }),
      );
    } catch {
      // Ignore quota / private-mode failures; in-memory consumers still update.
    }
  }
  return normalized;
}

/** Default compare roster: home team first, then common peer teams. */
export function defaultCompareTeams(homeTeam: number): number[] {
  const peers = [254, 1678, 1114].filter((team) => team !== homeTeam);
  return [homeTeam, ...peers].slice(0, 4);
}

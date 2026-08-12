import type { CompLevel, TbaMatch } from "@/lib/types/tba";

/** Chronological stage order: quals first, then playoffs through finals. */
const COMP_LEVEL_ORDER: Record<CompLevel, number> = {
  qm: 0,
  ef: 1,
  qf: 2,
  sf: 3,
  f: 4,
};

function compLevelRank(compLevel: string): number {
  return COMP_LEVEL_ORDER[compLevel as CompLevel] ?? 99;
}

/**
 * Sort matches chronologically: QM 1..N, then playoff stages by set/match number.
 */
export function sortMatchesChronologically<T extends Pick<TbaMatch, "comp_level" | "set_number" | "match_number">>(
  matches: T[],
): T[] {
  return [...matches].sort((a, b) => {
    const stageDiff = compLevelRank(a.comp_level) - compLevelRank(b.comp_level);
    if (stageDiff !== 0) return stageDiff;

    const setDiff = a.set_number - b.set_number;
    if (setDiff !== 0) return setDiff;

    return a.match_number - b.match_number;
  });
}

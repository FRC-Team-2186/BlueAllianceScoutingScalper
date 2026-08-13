import type { MatchAnalysis } from "@/lib/types/analysis";
import type { TbaMatch } from "@/lib/types/tba";

export interface RobotPhasePoints {
  auto: number;
  teleop: number;
  endgame: number;
  total: number;
}

export interface RobotMatchPoints extends RobotPhasePoints {
  teamKey: string;
  matchKey: string;
  alliance: "red" | "blue";
  station: 1 | 2 | 3;
  /** tba = parsed from score_breakdown; ai = vision summary; hybrid = both */
  source: "tba" | "ai" | "hybrid" | "estimated";
  notes?: string[];
}

export interface RobotPointAverages extends RobotPhasePoints {
  teamKey: string;
  matchCount: number;
  source: RobotMatchPoints["source"];
}

type AllianceBreakdown = Record<string, unknown>;

const ENDGAME_POINTS_2025: Record<string, number> = {
  None: 0,
  Park: 2,
  ShallowCage: 6,
  DeepCage: 12,
  Parked: 2,
  Shallow: 6,
  Deep: 12,
  Stage: 10,
  Harmony: 5,
  Spotlit: 4,
};

function asRecord(value: unknown): AllianceBreakdown | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as AllianceBreakdown;
}

function endgamePointsFromValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  return ENDGAME_POINTS_2025[value] ?? (/park/i.test(value) ? 2 : 0);
}

function autoLinePoints(value: unknown): number {
  if (value === true || value === "Yes" || value === "yes") return 3;
  if (typeof value === "number") return value;
  return 0;
}

function getAllianceAndStation(
  match: TbaMatch,
  teamKey: string,
): { alliance: "red" | "blue"; station: 1 | 2 | 3 } | null {
  const redIndex = match.alliances.red.team_keys.indexOf(teamKey);
  if (redIndex >= 0) {
    return { alliance: "red", station: (redIndex + 1) as 1 | 2 | 3 };
  }
  const blueIndex = match.alliances.blue.team_keys.indexOf(teamKey);
  if (blueIndex >= 0) {
    return { alliance: "blue", station: (blueIndex + 1) as 1 | 2 | 3 };
  }
  return null;
}

/**
 * Extract single-robot Auto / Teleop / Endgame points from a TBA match.
 *
 * ONLY uses per-robot score_breakdown fields (e.g. autoLineRobotN, endGameRobotN).
 * Never divides alliance totals by 3 — Statbotics EPA breakdown is the source of
 * truth for expected points on /compare.
 */
export function extractRobotPointsFromTbaMatch(
  match: TbaMatch,
  teamKey: string,
): RobotMatchPoints | null {
  const placement = getAllianceAndStation(match, teamKey);
  if (!placement) return null;

  const notes: string[] = [];
  const breakdownRoot = asRecord(match.score_breakdown);
  const allianceBreakdown = breakdownRoot
    ? asRecord(breakdownRoot[placement.alliance])
    : null;

  let auto = 0;
  const teleop = 0;
  let endgame = 0;
  let source: RobotMatchPoints["source"] = "estimated";

  if (allianceBreakdown) {
    const station = placement.station;
    const lineKey = `autoLineRobot${station}`;
    const endKey = `endGameRobot${station}`;

    if (lineKey in allianceBreakdown) {
      auto += autoLinePoints(allianceBreakdown[lineKey]);
      source = "tba";
    }

    if (endKey in allianceBreakdown) {
      endgame += endgamePointsFromValue(allianceBreakdown[endKey]);
      source = "tba";
    }

    // Teleop has no reliable per-robot TBA attribution — leave 0 and note it.
    // Callers should prefer Statbotics epa.breakdown.teleop_points for expected teleop.
    if (auto > 0 || endgame > 0) {
      notes.push(
        "TBA per-robot fields only (no alliance÷3). Prefer Statbotics epa.breakdown for expected points.",
      );
    } else {
      notes.push(
        "No per-robot TBA auto/endgame fields; use Statbotics epa.breakdown.*_points instead of alliance splits.",
      );
    }
  } else {
    notes.push(
      "No TBA score_breakdown; solo TBA points unavailable (do not invent alliance÷3 shares).",
    );
  }

  // If we have nothing per-robot, still return a zeroed row so callers know the
  // team played — but totals stay 0 (Statbotics should supply expected points).
  return {
    teamKey,
    matchKey: match.key,
    alliance: placement.alliance,
    station: placement.station,
    auto,
    teleop,
    endgame,
    total: Math.round((auto + teleop + endgame) * 10) / 10,
    source,
    notes: notes.length ? notes : undefined,
  };
}

export function extractRobotPointsFromAnalysis(
  analysis: MatchAnalysis,
  teamKey: string,
): RobotPhasePoints | null {
  const auto = analysis.summary.autoPoints?.[teamKey];
  const teleop = analysis.summary.teleopCycles?.[teamKey];
  const endgame = analysis.summary.endgamePoints?.[teamKey];

  const actionAuto = analysis.actions
    .filter((a) => a.teamKey === teamKey && a.phase === "auto")
    .reduce((sum, a) => sum + (a.points ?? 0), 0);
  const actionTeleop = analysis.actions
    .filter((a) => a.teamKey === teamKey && a.phase === "teleop")
    .reduce((sum, a) => sum + (a.points ?? 0), 0);
  const actionEndgame = analysis.actions
    .filter((a) => a.teamKey === teamKey && a.phase === "endgame")
    .reduce((sum, a) => sum + (a.points ?? 0), 0);

  const resolvedAuto = auto ?? (actionAuto || undefined);
  const resolvedTeleop = teleop ?? (actionTeleop || undefined);
  const resolvedEndgame = endgame ?? (actionEndgame || undefined);

  if (
    resolvedAuto == null &&
    resolvedTeleop == null &&
    resolvedEndgame == null
  ) {
    return null;
  }

  const a = resolvedAuto ?? 0;
  const t = resolvedTeleop ?? 0;
  const e = resolvedEndgame ?? 0;
  return {
    auto: a,
    teleop: t,
    endgame: e,
    total: a + t + e,
  };
}

/** Prefer AI individual attribution; fall back to TBA per-robot fields only. */
export function resolveRobotMatchPoints(options: {
  match: TbaMatch;
  teamKey: string;
  analysis?: MatchAnalysis | null;
}): RobotMatchPoints | null {
  const tba = extractRobotPointsFromTbaMatch(options.match, options.teamKey);
  const ai = options.analysis
    ? extractRobotPointsFromAnalysis(options.analysis, options.teamKey)
    : null;

  if (!tba && !ai) return null;

  if (ai && tba) {
    return {
      ...tba,
      auto: ai.auto,
      teleop: ai.teleop,
      endgame: ai.endgame,
      total: ai.total,
      source: "hybrid",
      notes: [
        ...(tba.notes ?? []),
        "AI vision individual points preferred over TBA per-robot fields.",
      ],
    };
  }

  if (ai) {
    const placement = getAllianceAndStation(options.match, options.teamKey);
    return {
      teamKey: options.teamKey,
      matchKey: options.match.key,
      alliance: placement?.alliance ?? "red",
      station: placement?.station ?? 1,
      auto: ai.auto,
      teleop: ai.teleop,
      endgame: ai.endgame,
      total: ai.total,
      source: "ai",
    };
  }

  return tba;
}

export function averageRobotPoints(
  points: RobotMatchPoints[],
): RobotPointAverages | null {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (acc, row) => ({
      auto: acc.auto + row.auto,
      teleop: acc.teleop + row.teleop,
      endgame: acc.endgame + row.endgame,
      total: acc.total + row.total,
    }),
    { auto: 0, teleop: 0, endgame: 0, total: 0 },
  );
  const n = points.length;
  const sources = new Set(points.map((p) => p.source));
  const source: RobotMatchPoints["source"] =
    sources.size === 1 ? ([...sources][0] as RobotMatchPoints["source"]) : "hybrid";

  return {
    teamKey: points[0]?.teamKey ?? "",
    matchCount: n,
    auto: Math.round((sum.auto / n) * 10) / 10,
    teleop: Math.round((sum.teleop / n) * 10) / 10,
    endgame: Math.round((sum.endgame / n) * 10) / 10,
    total: Math.round((sum.total / n) * 10) / 10,
    source,
  };
}

export function buildRobotPointsMapFromMatch(
  match: TbaMatch,
  analysis?: MatchAnalysis | null,
): Record<string, RobotPhasePoints> {
  const teamKeys = [
    ...match.alliances.red.team_keys,
    ...match.alliances.blue.team_keys,
  ];
  const map: Record<string, RobotPhasePoints> = {};
  for (const teamKey of teamKeys) {
    const points = resolveRobotMatchPoints({ match, teamKey, analysis });
    if (!points) continue;
    map[teamKey] = {
      auto: points.auto,
      teleop: points.teleop,
      endgame: points.endgame,
      total: points.total,
    };
  }
  return map;
}

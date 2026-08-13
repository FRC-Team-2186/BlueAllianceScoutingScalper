import type {
  CompareMetrics,
  MatchAnalysis,
  RobotFeatures,
} from "@/lib/types/analysis";
import {
  emptyRobotFeatures,
  normalizeCompareMetrics,
  normalizeRobotFeatures,
  UNCONFIRMED_ROBOT_FEATURE,
} from "@/lib/types/analysis";

/** Aggregated AI metrics using the strict compare schema keys. */
export interface TeamAiMetrics {
  teamKey: string;
  team: number;
  matchCount: number;
  /** @deprecated Prefer ai_auto — kept for older callers. */
  aiAutoScore: number;
  /** @deprecated Prefer ai_teleop */
  aiTeleopCycles: number;
  /** @deprecated Prefer ai_endgame */
  aiEndgamePoints: number;
  /** @deprecated Prefer vision_conf */
  visionConfidence: number;
  /** @deprecated Prefer climb_pct */
  endgameClimbRate: number;
  /** Strict compare keys mirrored for /compare table headers. */
  ai_auto: number;
  ai_teleop: number;
  ai_endgame: number;
  climb_pct: number;
  vision_conf: number;
  weighted_score: number;
  /** Gemini visual/mechanical classifications. */
  drivetrain: string;
  shooter_count: number;
  shooter_type: string;
  endgame_mechanism: string;
  ai_confidence: number;
  featuresConfirmed: boolean;
  verifiedVideo: boolean;
  sources: Array<MatchAnalysis["source"]>;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function majorityString(values: string[], fallback: string): string {
  const counts = new Map<string, number>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || trimmed === UNCONFIRMED_ROBOT_FEATURE) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  let best = fallback;
  let bestCount = 0;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function hasClimbAction(analysis: MatchAnalysis, teamKey: string): boolean {
  if (analysis.phaseTimeline?.endgame?.status === "climb") {
    return analysis.focusTeamKey === teamKey || !analysis.focusTeamKey;
  }
  return analysis.actions.some(
    (action) =>
      action.teamKey === teamKey &&
      action.phase === "endgame" &&
      /climb|hang|cage|park|trap/i.test(action.action),
  );
}

function metricsFromAnalysis(
  analysis: MatchAnalysis,
  teamKey: string,
): CompareMetrics {
  if (
    analysis.compareMetrics &&
    (!analysis.focusTeamKey || analysis.focusTeamKey === teamKey)
  ) {
    return normalizeCompareMetrics(analysis.compareMetrics);
  }

  const robot = analysis.summary.robotPoints?.[teamKey];
  const ai_auto = robot?.auto ?? analysis.summary.autoPoints?.[teamKey] ?? 0;
  const ai_teleop =
    robot?.teleop ?? analysis.summary.teleopCycles?.[teamKey] ?? 0;
  const ai_endgame =
    robot?.endgame ?? analysis.summary.endgamePoints?.[teamKey] ?? 0;
  const climb_pct = hasClimbAction(analysis, teamKey) ? 1 : 0;
  const confidences = analysis.actions
    .filter((action) => action.teamKey === teamKey)
    .map((action) => action.confidence ?? 0.5);
  const vision_conf = average(confidences);
  const weighted_score =
    ai_auto * 1.2 +
    ai_teleop * 1.5 +
    ai_endgame * 1.1 +
    climb_pct * 10 +
    vision_conf * 5;

  return normalizeCompareMetrics({
    ai_auto,
    ai_teleop,
    ai_endgame,
    climb_pct,
    vision_conf,
    weighted_score,
  });
}

function featuresFromAnalysis(
  analysis: MatchAnalysis,
  teamKey: string,
): RobotFeatures | null {
  if (
    analysis.robotFeatures &&
    (!analysis.focusTeamKey || analysis.focusTeamKey === teamKey)
  ) {
    return normalizeRobotFeatures(analysis.robotFeatures);
  }
  return null;
}

export function aggregateTeamAiMetrics(
  analyses: MatchAnalysis[],
  teamKey: string,
): TeamAiMetrics | null {
  const relevant = analyses.filter((analysis) => {
    if (
      analysis.focusTeamKey === teamKey &&
      (analysis.compareMetrics || analysis.robotFeatures)
    ) {
      return true;
    }
    const inSummary =
      analysis.summary.autoPoints?.[teamKey] !== undefined ||
      analysis.summary.teleopCycles?.[teamKey] !== undefined ||
      analysis.summary.endgamePoints?.[teamKey] !== undefined ||
      analysis.summary.defenseRating?.[teamKey] !== undefined ||
      analysis.summary.robotPoints?.[teamKey] !== undefined;
    const inActions = analysis.actions.some(
      (action) => action.teamKey === teamKey,
    );
    return inSummary || inActions;
  });

  if (relevant.length === 0) {
    return null;
  }

  const perMatch = relevant.map((analysis) =>
    metricsFromAnalysis(analysis, teamKey),
  );
  const featureRows = relevant
    .map((analysis) => featuresFromAnalysis(analysis, teamKey))
    .filter((row): row is RobotFeatures => row != null);

  const ai_auto = average(perMatch.map((m) => m.ai_auto));
  const ai_teleop = average(perMatch.map((m) => m.ai_teleop));
  const ai_endgame = average(perMatch.map((m) => m.ai_endgame));
  const climb_pct = average(perMatch.map((m) => m.climb_pct));
  const vision_conf = average(perMatch.map((m) => m.vision_conf));
  const weighted_score = average(perMatch.map((m) => m.weighted_score));

  const empty = emptyRobotFeatures();
  const featuresConfirmed = featureRows.length > 0;
  const drivetrain = featuresConfirmed
    ? majorityString(
        featureRows.map((row) => row.drivetrain),
        UNCONFIRMED_ROBOT_FEATURE,
      )
    : empty.drivetrain;
  const shooter_type = featuresConfirmed
    ? majorityString(
        featureRows.map((row) => row.shooter_type),
        UNCONFIRMED_ROBOT_FEATURE,
      )
    : empty.shooter_type;
  const endgame_mechanism = featuresConfirmed
    ? majorityString(
        featureRows.map((row) => row.endgame_mechanism),
        UNCONFIRMED_ROBOT_FEATURE,
      )
    : empty.endgame_mechanism;
  const shooter_count = featuresConfirmed
    ? Math.round(average(featureRows.map((row) => row.shooter_count)))
    : 0;
  const ai_confidence = featuresConfirmed
    ? average(featureRows.map((row) => row.ai_confidence))
    : average(perMatch.map((m) => m.vision_conf));

  const team = Number(teamKey.replace(/^frc/i, ""));
  const verifiedVideo = relevant.some(
    (analysis) => analysis.source === "gemini" || analysis.source === "cache",
  );

  return {
    teamKey,
    team: Number.isFinite(team) ? team : 0,
    matchCount: relevant.length,
    aiAutoScore: ai_auto,
    aiTeleopCycles: ai_teleop,
    aiEndgamePoints: ai_endgame,
    visionConfidence: vision_conf,
    endgameClimbRate: climb_pct,
    ai_auto,
    ai_teleop,
    ai_endgame,
    climb_pct,
    vision_conf,
    weighted_score,
    drivetrain,
    shooter_count,
    shooter_type,
    endgame_mechanism,
    ai_confidence,
    featuresConfirmed,
    verifiedVideo,
    sources: [...new Set(relevant.map((analysis) => analysis.source))],
  };
}

export function aggregateEventAiMetrics(
  analyses: MatchAnalysis[],
): Map<string, TeamAiMetrics> {
  const teamKeys = new Set<string>();
  for (const analysis of analyses) {
    if (analysis.focusTeamKey) {
      teamKeys.add(analysis.focusTeamKey);
    }
    for (const key of Object.keys(analysis.summary.autoPoints ?? {})) {
      teamKeys.add(key);
    }
    for (const key of Object.keys(analysis.summary.teleopCycles ?? {})) {
      teamKeys.add(key);
    }
    for (const key of Object.keys(analysis.summary.endgamePoints ?? {})) {
      teamKeys.add(key);
    }
    for (const key of Object.keys(analysis.summary.robotPoints ?? {})) {
      teamKeys.add(key);
    }
    for (const action of analysis.actions) {
      teamKeys.add(action.teamKey);
    }
  }

  const map = new Map<string, TeamAiMetrics>();
  for (const teamKey of teamKeys) {
    const metrics = aggregateTeamAiMetrics(analyses, teamKey);
    if (metrics) {
      map.set(teamKey, metrics);
    }
  }
  return map;
}

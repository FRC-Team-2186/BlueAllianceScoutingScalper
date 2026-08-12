import type { MatchAnalysis } from "@/lib/types/analysis";

export interface TeamAiMetrics {
  teamKey: string;
  team: number;
  matchCount: number;
  aiAutoScore: number;
  aiTeleopCycles: number;
  aiEndgamePoints: number;
  visionConfidence: number;
  endgameClimbRate: number;
  verifiedVideo: boolean;
  sources: Array<MatchAnalysis["source"]>;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hasClimbAction(analysis: MatchAnalysis, teamKey: string): boolean {
  return analysis.actions.some(
    (action) =>
      action.teamKey === teamKey &&
      action.phase === "endgame" &&
      /climb|hang|cage|park|trap/i.test(action.action),
  );
}

export function aggregateTeamAiMetrics(
  analyses: MatchAnalysis[],
  teamKey: string,
): TeamAiMetrics | null {
  const relevant = analyses.filter((analysis) => {
    const inSummary =
      analysis.summary.autoPoints?.[teamKey] !== undefined ||
      analysis.summary.teleopCycles?.[teamKey] !== undefined ||
      analysis.summary.endgamePoints?.[teamKey] !== undefined ||
      analysis.summary.defenseRating?.[teamKey] !== undefined;
    const inActions = analysis.actions.some((action) => action.teamKey === teamKey);
    return inSummary || inActions;
  });

  if (relevant.length === 0) {
    return null;
  }

  const autoScores = relevant.map((analysis) => {
    const robot = analysis.summary.robotPoints?.[teamKey];
    return robot?.auto ?? analysis.summary.autoPoints?.[teamKey] ?? 0;
  });
  const teleopCycles = relevant.map((analysis) => {
    const robot = analysis.summary.robotPoints?.[teamKey];
    return robot?.teleop ?? analysis.summary.teleopCycles?.[teamKey] ?? 0;
  });
  const endgamePoints = relevant.map((analysis) => {
    const robot = analysis.summary.robotPoints?.[teamKey];
    return robot?.endgame ?? analysis.summary.endgamePoints?.[teamKey] ?? 0;
  });
  const confidences = relevant.flatMap((analysis) =>
    analysis.actions
      .filter((action) => action.teamKey === teamKey)
      .map((action) => action.confidence ?? 0.5),
  );
  const climbFlags = relevant.map((analysis) =>
    hasClimbAction(analysis, teamKey) ? 1 : 0,
  );

  const team = Number(teamKey.replace(/^frc/i, ""));
  const verifiedVideo = relevant.some(
    (analysis) => analysis.source === "gemini" || analysis.source === "cache",
  );

  return {
    teamKey,
    team: Number.isFinite(team) ? team : 0,
    matchCount: relevant.length,
    aiAutoScore: average(autoScores),
    aiTeleopCycles: average(teleopCycles),
    aiEndgamePoints: average(endgamePoints),
    visionConfidence: average(confidences),
    endgameClimbRate: average(climbFlags),
    verifiedVideo,
    sources: [...new Set(relevant.map((analysis) => analysis.source))],
  };
}

export function aggregateEventAiMetrics(
  analyses: MatchAnalysis[],
): Map<string, TeamAiMetrics> {
  const teamKeys = new Set<string>();
  for (const analysis of analyses) {
    for (const key of Object.keys(analysis.summary.autoPoints ?? {})) {
      teamKeys.add(key);
    }
    for (const key of Object.keys(analysis.summary.teleopCycles ?? {})) {
      teamKeys.add(key);
    }
    for (const key of Object.keys(analysis.summary.endgamePoints ?? {})) {
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

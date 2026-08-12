import { buildRobotPointsMapFromMatch } from "@/lib/scoring/robot-points";
import type { MatchAnalysis } from "@/lib/types/analysis";
import type { TbaMatch } from "@/lib/types/tba";

/**
 * Ensure analysis.summary includes per-robot Auto/Teleop/Endgame points,
 * merging AI summary fields with TBA score_breakdown-derived solo points.
 */
export function enrichAnalysisWithRobotPoints(
  analysis: MatchAnalysis,
  match: TbaMatch,
): MatchAnalysis {
  const robotPoints = buildRobotPointsMapFromMatch(match, analysis);

  const autoPoints = { ...(analysis.summary.autoPoints ?? {}) };
  const teleopCycles = { ...(analysis.summary.teleopCycles ?? {}) };
  const endgamePoints = { ...(analysis.summary.endgamePoints ?? {}) };

  for (const [teamKey, points] of Object.entries(robotPoints)) {
    if (autoPoints[teamKey] == null) autoPoints[teamKey] = points.auto;
    if (teleopCycles[teamKey] == null) teleopCycles[teamKey] = points.teleop;
    if (endgamePoints[teamKey] == null) endgamePoints[teamKey] = points.endgame;
  }

  return {
    ...analysis,
    summary: {
      ...analysis.summary,
      autoPoints,
      teleopCycles,
      endgamePoints,
      robotPoints: {
        ...(analysis.summary.robotPoints ?? {}),
        ...robotPoints,
      },
    },
  };
}

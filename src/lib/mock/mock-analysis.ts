import { enrichAnalysisWithRobotPoints } from "@/lib/analysis/enrich-robot-points";
import { extractYoutubeVideoId } from "@/lib/api/youtube";
import type { MatchAnalysis } from "@/lib/types/analysis";
import type { TbaMatch } from "@/lib/types/tba";

export function createMockAnalysis(
  match: TbaMatch,
  teamKey: string,
): MatchAnalysis {
  const youtubeVideoId = extractYoutubeVideoId(match);
  const redScore = match.alliances.red.score;
  const blueScore = match.alliances.blue.score;

  const compareMetrics = {
    ai_auto: 6,
    ai_teleop: 12,
    ai_endgame: 10,
    climb_pct: 1,
    vision_conf: 0.5,
    weighted_score: 6 * 1.2 + 12 * 1.5 + 10 * 1.1 + 1 * 10 + 0.5 * 5,
  };

  const robotFeatures = {
    drivetrain: "Swerve",
    shooter_count: 1,
    shooter_type: "Single Flywheel",
    endgame_mechanism: "Elevator Climber",
    ai_confidence: 0.72,
  };

  const base: MatchAnalysis = {
    matchKey: match.key,
    eventKey: match.event_key,
    youtubeVideoId,
    source: "mock",
    analyzedAt: new Date().toISOString(),
    model: "mock-v1",
    focusTeamKey: teamKey,
    compareMetrics,
    robotFeatures,
    phaseTimeline: {
      autonomous: {
        startPosition: "00:00 — mock start",
        preLoadScored: "00:08 — mock pre-load",
        mobility: "00:12 — left starting zone",
      },
      teleop: {
        cycleCount: 3,
        intakeLocations: [{ time: "01:20", location: "mock intake" }],
        scoringLocations: [{ time: "01:32", location: "mock score" }],
      },
      endgame: {
        status: "climb",
        statusTime: "02:15",
        notes: "Mock cage climb",
      },
    },
    actions: [
      {
        timestampSec: 8,
        phase: "auto",
        teamKey,
        action: "Mock autonomous scoring action",
        points: 6,
        confidence: 0.5,
        notes: "Generated because API keys are missing or rate limit was hit.",
      },
      {
        timestampSec: 92,
        phase: "teleop",
        teamKey,
        action: "Mock teleop cycle",
        points: 4,
        confidence: 0.5,
      },
      {
        timestampSec: 135,
        phase: "endgame",
        teamKey,
        action: "Mock endgame climb",
        points: 10,
        confidence: 0.5,
      },
    ],
    summary: {
      autoPoints: { [teamKey]: 6 },
      teleopCycles: { [teamKey]: 3 },
      endgamePoints: { [teamKey]: 10 },
      defenseRating: { [teamKey]: 0.6 },
      robotPoints: {
        [teamKey]: { auto: 6, teleop: 12, endgame: 10, total: 28 },
      },
    },
    tbaVerification: {
      redScore,
      blueScore,
      aiRedTotal: Math.round(redScore * 0.9),
      aiBlueTotal: Math.round(blueScore * 0.9),
      delta: Math.abs(redScore - blueScore) > 0 ? 2 : 0,
    },
  };

  return enrichAnalysisWithRobotPoints(base, match);
}

import type { MatchAnalysis } from "@/lib/types/analysis";
import type { TbaMatch } from "@/lib/types/tba";
import { extractYoutubeVideoId } from "@/lib/api/youtube";

export function createMockAnalysis(
  match: TbaMatch,
  teamKey: string,
): MatchAnalysis {
  const youtubeVideoId = extractYoutubeVideoId(match);
  const redScore = match.alliances.red.score;
  const blueScore = match.alliances.blue.score;

  return {
    matchKey: match.key,
    eventKey: match.event_key,
    youtubeVideoId,
    source: "mock",
    analyzedAt: new Date().toISOString(),
    model: "mock-v1",
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
    },
    tbaVerification: {
      redScore,
      blueScore,
      aiRedTotal: Math.round(redScore * 0.9),
      aiBlueTotal: Math.round(blueScore * 0.9),
      delta: Math.abs(redScore - blueScore) > 0 ? 2 : 0,
    },
  };
}

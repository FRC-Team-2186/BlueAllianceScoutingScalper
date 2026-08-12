import type { SampledFrame } from "@/lib/analysis/frame-sampler";
import type { TbaMatch } from "@/lib/types/tba";

export function buildMatchAnalysisPrompt(
  match: TbaMatch,
  frames: SampledFrame[],
  focusTeamKey?: string,
): string {
  const redTeams = match.alliances.red.team_keys.join(", ");
  const blueTeams = match.alliances.blue.team_keys.join(", ");
  const frameManifest = frames
    .map(
      (frame, index) =>
        `Frame ${index + 1}: t=${frame.timestampSec}s phase=${frame.phase}`,
    )
    .join("\n");

  return `You are an expert FRC match scout analyzing ${match.event_key} match ${match.key}.

Match context:
- Red alliance (${match.alliances.red.score} pts): ${redTeams}
- Blue alliance (${match.alliances.blue.score} pts): ${blueTeams}
- Comp level: ${match.comp_level}, match #${match.match_number}
- Score breakdown (TBA): ${JSON.stringify(match.score_breakdown ?? {})}
${focusTeamKey ? `- Focus team for detailed notes: ${focusTeamKey}` : ""}

Sampled frames (in order):
${frameManifest}

Analyze robot actions across Auto (0-15s), Teleop, and Endgame (last ~30s).
Return ONLY valid JSON with this exact shape:
{
  "actions": [
    {
      "timestampSec": number,
      "phase": "auto" | "teleop" | "endgame",
      "teamKey": "frc####",
      "action": "short description",
      "points": number,
      "confidence": number between 0 and 1,
      "notes": "optional detail"
    }
  ],
  "summary": {
    "autoPoints": { "frc####": number },
    "teleopCycles": { "frc####": number },
    "endgamePoints": { "frc####": number },
    "defenseRating": { "frc####": number between 0 and 1 }
  },
  "tbaVerification": {
    "redScore": ${match.alliances.red.score},
    "blueScore": ${match.alliances.blue.score},
    "aiRedTotal": number,
    "aiBlueTotal": number,
    "delta": number
  }
}

Rules:
- Use team keys like frc2186 (lowercase frc prefix).
- Prefer actions visible in the provided frames; infer conservatively when uncertain.
- aiRedTotal/aiBlueTotal should approximate summed robot contributions for each alliance.
- delta is absolute difference between TBA alliance totals and AI-estimated totals.`;
}

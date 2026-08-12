import type { SampledFrame } from "@/lib/analysis/frame-sampler";
import { getTeamAlliance } from "@/lib/api/youtube";
import type { TbaMatch } from "@/lib/types/tba";

function teamNumberFromKey(teamKey: string): string {
  return teamKey.replace(/^frc/i, "");
}

function bumperColorLabel(alliance: "red" | "blue" | null): string {
  if (alliance === "red") return "Red";
  if (alliance === "blue") return "Blue";
  return "Unknown";
}

export function buildFocusTeamDirective(
  match: TbaMatch,
  focusTeamKey?: string,
): string | null {
  if (!focusTeamKey) return null;
  const teamNumber = teamNumberFromKey(focusTeamKey);
  const alliance = getTeamAlliance(match, focusTeamKey);
  const bumper = bumperColorLabel(alliance);
  return `Focus strictly on Team ${teamNumber} in ${bumper} Bumper`;
}

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
        `Frame ${index + 1}: t=${frame.timestampSec}s (${formatMmSs(frame.timestampSec)}) phase=${frame.phase}`,
    )
    .join("\n");

  const focusDirective = buildFocusTeamDirective(match, focusTeamKey);
  const focusTeamNumber = focusTeamKey
    ? teamNumberFromKey(focusTeamKey)
    : null;
  const bumper =
    focusTeamKey != null
      ? bumperColorLabel(getTeamAlliance(match, focusTeamKey))
      : null;

  const focusBlock = focusDirective
    ? `
TARGET TEAM IDENTIFICATION (STRICT):
- ${focusDirective}.
- Track ONLY this robot by bumper color (${bumper}) and 4-digit bumper number (${focusTeamNumber}).
- Ignore other robots except when they interact with the focus team (defense contact, shared scoring race).
- All compare_metrics values (ai_auto, ai_teleop, ai_endgame, climb_pct, vision_conf, weighted_score) MUST describe this focus team only.
`
    : "";

  return `You are an expert FRC match scout analyzing ${match.event_key} match ${match.key}.

Match context:
- Red alliance (${match.alliances.red.score} pts): ${redTeams}
- Blue alliance (${match.alliances.blue.score} pts): ${blueTeams}
- Comp level: ${match.comp_level}, match #${match.match_number}
- Score breakdown (TBA): ${JSON.stringify(match.score_breakdown ?? {})}
${focusBlock}
Sampled frames (in order; video was pre-processed to ≤720p @ 10–15 FPS, capped at 2:30):
${frameManifest}

Analyze robot actions across Auto (0-15s), Teleop, and Endgame (last ~30s).
Attribute points to INDIVIDUAL robots (not just alliance totals).

DETAILED PHASE TIMELINE (required):
Provide structured MM:SS timestamps for the focus team${focusTeamNumber ? ` (Team ${focusTeamNumber})` : ""}:
- Autonomous: start position, pre-load scored, mobility
- Teleop: cycle count, intake locations, scoring locations
- Endgame: cage climb / park status with timestamp

Return ONLY valid JSON with this exact shape (every field required; use 0 when unknown):
{
  "ai_auto": number,
  "ai_teleop": number,
  "ai_endgame": number,
  "climb_pct": number,
  "vision_conf": number,
  "weighted_score": number,
  "phaseTimeline": {
    "autonomous": {
      "startPosition": "MM:SS — description",
      "preLoadScored": "MM:SS — description or none",
      "mobility": "MM:SS — description or none"
    },
    "teleop": {
      "cycleCount": number,
      "intakeLocations": [{ "time": "MM:SS", "location": "string" }],
      "scoringLocations": [{ "time": "MM:SS", "location": "string" }]
    },
    "endgame": {
      "status": "climb" | "park" | "none",
      "statusTime": "MM:SS",
      "notes": "string"
    }
  },
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
    "defenseRating": { "frc####": number between 0 and 1 },
    "robotPoints": {
      "frc####": { "auto": number, "teleop": number, "endgame": number, "total": number }
    }
  },
  "tbaVerification": {
    "redScore": ${match.alliances.red.score},
    "blueScore": ${match.alliances.blue.score},
    "aiRedTotal": number,
    "aiBlueTotal": number,
    "delta": number
  }
}

COMPARE METRIC RULES (focus team):
- ai_auto: estimated autonomous points for the focus team (number, never null).
- ai_teleop: estimated teleop points / cycle value for the focus team (number, never null).
- ai_endgame: estimated endgame points for the focus team (number, never null).
- climb_pct: 0–1 probability the focus team climbed/caged (use 1 if confirmed climb, 0.5 park, 0 none).
- vision_conf: 0–1 overall vision confidence for focus-team tracking.
- weighted_score: ai_auto*1.2 + ai_teleop*1.5 + ai_endgame*1.1 + climb_pct*10 + vision_conf*5.

Rules:
- Use team keys like frc2186 (lowercase frc prefix).
- Include EVERY alliance robot in summary.autoPoints, teleopCycles, endgamePoints, and robotPoints.
- robotPoints must be single-robot contributions (Auto leave/score, Teleop cycles as point estimate, Endgame climb/park).
- Prefer actions visible in the provided frames; infer conservatively when uncertain.
- Cross-check TBA per-robot fields (autoLineRobotN, endGameRobotN) when present.
- aiRedTotal/aiBlueTotal should approximate summed individual robot contributions for each alliance.
- delta is absolute difference between TBA alliance totals and AI-estimated totals.
- Never omit ai_auto, ai_teleop, ai_endgame, climb_pct, vision_conf, or weighted_score — default each to 0 if unknown.`;
}

function formatMmSs(totalSec: number): string {
  const clamped = Math.max(0, Math.floor(totalSec));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

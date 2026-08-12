import { NextRequest, NextResponse } from "next/server";
import { getCachedAnalysis } from "@/lib/cache/analysis-store";
import { getTeamEventMatches } from "@/lib/api/tba-client";
import {
  averageRobotPoints,
  resolveRobotMatchPoints,
  type RobotMatchPoints,
} from "@/lib/scoring/robot-points";

/**
 * GET /api/scoring/solo?team=2186&event=2025vaale
 * Returns averaged single-robot Auto/Teleop/Endgame points for a team at an event.
 */
export async function GET(request: NextRequest) {
  const team = Number(request.nextUrl.searchParams.get("team"));
  const eventKey = request.nextUrl.searchParams.get("event");

  if (!Number.isFinite(team) || team <= 0 || !eventKey) {
    return NextResponse.json(
      { error: "Query params team and event are required" },
      { status: 400 },
    );
  }

  const teamKey = `frc${team}`;

  try {
    const matches = await getTeamEventMatches(teamKey, eventKey);
    const perMatch: RobotMatchPoints[] = [];

    for (const match of matches) {
      const analysis = await getCachedAnalysis(eventKey, match.key);
      const points = resolveRobotMatchPoints({ match, teamKey, analysis });
      if (points) perMatch.push(points);
    }

    const averages = averageRobotPoints(perMatch);
    return NextResponse.json({
      team,
      teamKey,
      eventKey,
      matchCount: perMatch.length,
      averages,
      matches: perMatch,
    });
  } catch (error) {
    console.error("[scoring/solo] failed", { team, eventKey, error });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to compute solo points",
        team,
        teamKey,
        eventKey,
        averages: null,
        matches: [],
      },
      { status: 200 },
    );
  }
}

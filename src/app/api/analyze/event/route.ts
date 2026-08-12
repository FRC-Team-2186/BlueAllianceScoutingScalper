import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeMatchVideo } from "@/lib/analysis/video-analyzer";
import { getTeamEventMatches } from "@/lib/api/tba-client";
import { extractYoutubeVideoId } from "@/lib/api/youtube";
import { invalidateEventAnalysisCache } from "@/lib/cache/analysis-store";
import {
  createAnalysisJob,
  markJobComplete,
  markJobFailed,
  markJobProcessing,
} from "@/lib/cache/job-store";
import { parseForceRefreshParams } from "@/lib/cache/force-refresh";

export const maxDuration = 300;

const BodySchema = z.object({
  eventKey: z.string().min(1),
  teamKeys: z.array(z.string()).optional(),
  teams: z.array(z.number()).optional(),
  force: z.boolean().optional(),
  /** When true, only remove/re-queue analyses missing compare schema keys. */
  staleOnly: z.boolean().optional(),
  limit: z.number().int().positive().max(40).optional(),
});

/**
 * POST /api/analyze/event
 * Invalidates stale (or all) analysis cache for an event and re-queues Gemini
 * analysis for matches involving the requested teams that have YouTube videos.
 *
 * Supports `?force=true` / `?cache=false` in addition to body.force.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const query = parseForceRefreshParams(request.nextUrl.searchParams);
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const force = Boolean(parsed.data.force || query.bypassCache);
  const staleOnly = parsed.data.staleOnly ?? true;
  const eventKey = parsed.data.eventKey;
  const limit = parsed.data.limit ?? 12;

  const teamKeys = new Set<string>(parsed.data.teamKeys ?? []);
  for (const team of parsed.data.teams ?? []) {
    teamKeys.add(`frc${team}`);
  }

  const invalidation = await invalidateEventAnalysisCache(
    eventKey,
    force && !staleOnly ? "all" : "staleOnly",
  );

  const matchKeys = new Set<string>(invalidation.deleted);

  for (const teamKey of teamKeys) {
    try {
      const matches = await getTeamEventMatches(teamKey, eventKey);
      for (const match of matches) {
        if (extractYoutubeVideoId(match)) {
          matchKeys.add(match.key);
        }
      }
    } catch (error) {
      console.warn("[analyze/event] failed to list matches", {
        teamKey,
        eventKey,
        error,
      });
    }
  }

  const queued = [...matchKeys].slice(0, limit);
  const jobs: Array<{ matchKey: string; teamKey?: string }> = [];

  for (const matchKey of queued) {
    const focusTeam = [...teamKeys][0];

    await createAnalysisJob({
      matchKey,
      eventKey,
      teamKey: focusTeam,
    });
    jobs.push({ matchKey, teamKey: focusTeam });

    after(async () => {
      try {
        await markJobProcessing(matchKey);
        const result = await analyzeMatchVideo({
          matchKey,
          teamKey: focusTeam,
          force: true,
        });
        await markJobComplete(matchKey, result.status);
      } catch (error) {
        await markJobFailed(
          matchKey,
          error instanceof Error ? error.message : "Event re-analyze failed",
        );
      }
    });
  }

  return NextResponse.json(
    {
      status: "processing",
      eventKey,
      force,
      staleOnly,
      invalidated: invalidation.deleted,
      kept: invalidation.kept,
      queued: jobs,
      message:
        jobs.length > 0
          ? `Queued ${jobs.length} match video(s) for fresh Gemini analysis.`
          : "Cache invalidated; no match videos queued (add teams or analyze from match pages).",
    },
    { status: 202 },
  );
}

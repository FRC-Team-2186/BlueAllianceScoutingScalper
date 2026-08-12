import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeMatchVideo } from "@/lib/analysis/video-analyzer";
import {
  createAnalysisJob,
  getAnalysisJob,
  markJobComplete,
  markJobFailed,
  markJobProcessing,
} from "@/lib/cache/job-store";
import { getCachedAnalysis } from "@/lib/cache/analysis-store";
import { getMatch } from "@/lib/api/tba-client";

export const maxDuration = 300;

const AnalyzeRequestSchema = z.object({
  matchKey: z.string().min(1),
  teamKey: z.string().optional(),
  force: z.boolean().optional(),
  async: z.boolean().optional(),
});

async function runAnalysisJob(params: {
  matchKey: string;
  teamKey?: string;
  force?: boolean;
}) {
  try {
    await markJobProcessing(params.matchKey);
    const result = await analyzeMatchVideo(params);
    await markJobComplete(params.matchKey, result.status);
  } catch (error) {
    await markJobFailed(
      params.matchKey,
      error instanceof Error ? error.message : "Unknown analysis error",
    );
  }
}

export async function GET(request: NextRequest) {
  const matchKey = request.nextUrl.searchParams.get("matchKey");
  if (!matchKey) {
    return NextResponse.json(
      { error: "matchKey query parameter is required" },
      { status: 400 },
    );
  }

  const job = await getAnalysisJob(matchKey);
  if (!job) {
    return NextResponse.json({ error: "Job not found", matchKey }, { status: 404 });
  }

  let analysis = null;
  if (job.status === "complete") {
    analysis = await getCachedAnalysis(job.eventKey, job.matchKey);
  }

  return NextResponse.json({ job, analysis });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = AnalyzeRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { matchKey, teamKey, force, async: runAsync } = parsed.data;

  if (!force) {
    try {
      const match = await getMatch(matchKey);
      const cached = await getCachedAnalysis(match.event_key, matchKey);
      if (cached) {
        return NextResponse.json({
          status: "cached",
          job: {
            matchKey,
            eventKey: match.event_key,
            teamKey,
            status: "complete",
            createdAt: cached.analyzedAt,
            updatedAt: cached.analyzedAt,
            resultStatus: "cached",
          },
          analysis: cached,
        });
      }
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to load match from TBA",
        },
        { status: 502 },
      );
    }
  }

  let match;
  try {
    match = await getMatch(matchKey);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load match from TBA",
      },
      { status: 502 },
    );
  }

  const job = await createAnalysisJob({
    matchKey,
    eventKey: match.event_key,
    teamKey,
  });

  if (runAsync) {
    after(async () => {
      await runAnalysisJob({ matchKey, teamKey, force });
    });

    return NextResponse.json(
      {
        status: "processing",
        job,
      },
      { status: 202 },
    );
  }

  await runAnalysisJob({ matchKey, teamKey, force });
  const completedJob = await getAnalysisJob(matchKey);
  const analysis = await getCachedAnalysis(match.event_key, matchKey);

  return NextResponse.json({
    status: completedJob?.resultStatus ?? "complete",
    job: completedJob,
    analysis,
  });
}

import { z } from "zod";
import { readJsonCache, writeJsonCache } from "@/lib/cache/file-store";
import type { MatchAnalysis } from "@/lib/types/analysis";

export const AnalysisJobSchema = z.object({
  matchKey: z.string(),
  eventKey: z.string(),
  teamKey: z.string().optional(),
  status: z.enum(["queued", "processing", "complete", "failed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().optional(),
  resultStatus: z.enum(["cached", "complete", "mock"]).optional(),
});

export type AnalysisJob = z.infer<typeof AnalysisJobSchema>;

function jobPath(matchKey: string): string[] {
  return ["jobs", `${matchKey}.json`];
}

export async function getAnalysisJob(matchKey: string): Promise<AnalysisJob | null> {
  const job = await readJsonCache<unknown>(jobPath(matchKey));
  if (!job) return null;
  const parsed = AnalysisJobSchema.safeParse(job);
  return parsed.success ? parsed.data : null;
}

export async function upsertAnalysisJob(
  job: AnalysisJob,
): Promise<AnalysisJob> {
  const validated = AnalysisJobSchema.parse(job);
  await writeJsonCache(jobPath(validated.matchKey), validated);
  return validated;
}

export async function createAnalysisJob(params: {
  matchKey: string;
  eventKey: string;
  teamKey?: string;
}): Promise<AnalysisJob> {
  const now = new Date().toISOString();
  return upsertAnalysisJob({
    matchKey: params.matchKey,
    eventKey: params.eventKey,
    teamKey: params.teamKey,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });
}

export async function markJobProcessing(matchKey: string): Promise<AnalysisJob> {
  const existing = await getAnalysisJob(matchKey);
  if (!existing) {
    throw new Error(`Job not found for match ${matchKey}`);
  }
  return upsertAnalysisJob({
    ...existing,
    status: "processing",
    updatedAt: new Date().toISOString(),
  });
}

export async function markJobComplete(
  matchKey: string,
  resultStatus: AnalysisJob["resultStatus"],
): Promise<AnalysisJob> {
  const existing = await getAnalysisJob(matchKey);
  if (!existing) {
    throw new Error(`Job not found for match ${matchKey}`);
  }
  return upsertAnalysisJob({
    ...existing,
    status: "complete",
    resultStatus,
    updatedAt: new Date().toISOString(),
  });
}

export async function markJobFailed(
  matchKey: string,
  error: string,
): Promise<AnalysisJob> {
  const existing = await getAnalysisJob(matchKey);
  if (!existing) {
    throw new Error(`Job not found for match ${matchKey}`);
  }
  return upsertAnalysisJob({
    ...existing,
    status: "failed",
    error,
    updatedAt: new Date().toISOString(),
  });
}

export interface AnalysisJobResponse {
  job: AnalysisJob;
  analysis?: MatchAnalysis;
}

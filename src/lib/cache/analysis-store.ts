import { MatchAnalysisSchema, type CacheIndexEntry, type MatchAnalysis } from "@/lib/types/analysis";
import {
  listJsonCacheFiles,
  readJsonCache,
  writeJsonCache,
} from "@/lib/cache/file-store";

function analysisPath(eventKey: string, matchKey: string): string[] {
  return ["analysis", eventKey, `${matchKey}.json`];
}

export async function getCachedAnalysis(
  eventKey: string,
  matchKey: string,
): Promise<MatchAnalysis | null> {
  const cached = await readJsonCache<unknown>(analysisPath(eventKey, matchKey));
  if (!cached) return null;

  const parsed = MatchAnalysisSchema.safeParse(cached);
  if (!parsed.success) {
    return null;
  }

  return { ...parsed.data, source: "cache" };
}

export async function saveAnalysisCache(
  analysis: MatchAnalysis,
): Promise<MatchAnalysis> {
  const payload: MatchAnalysis = {
    ...analysis,
    source: analysis.source === "cache" ? "gemini" : analysis.source,
    analyzedAt: analysis.analyzedAt || new Date().toISOString(),
  };

  const validated = MatchAnalysisSchema.parse(payload);
  await writeJsonCache(analysisPath(analysis.eventKey, analysis.matchKey), validated);
  return validated;
}

export async function listCachedAnalyses(
  eventKey: string,
): Promise<CacheIndexEntry[]> {
  const matchKeys = await listJsonCacheFiles(["analysis", eventKey]);
  const entries: CacheIndexEntry[] = [];

  for (const matchKey of matchKeys) {
    const analysis = await getCachedAnalysis(eventKey, matchKey);
    if (!analysis) continue;
    entries.push({
      matchKey: analysis.matchKey,
      eventKey: analysis.eventKey,
      analyzedAt: analysis.analyzedAt,
      source: analysis.source,
      actionCount: analysis.actions.length,
    });
  }

  return entries.sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
}

export async function hasCachedAnalysis(
  eventKey: string,
  matchKey: string,
): Promise<boolean> {
  const cached = await getCachedAnalysis(eventKey, matchKey);
  return cached !== null;
}

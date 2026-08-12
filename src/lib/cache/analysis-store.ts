import {
  CompareMetricsSchema,
  MatchAnalysisSchema,
  type CacheIndexEntry,
  type MatchAnalysis,
} from "@/lib/types/analysis";
import {
  deleteJsonCache,
  listJsonCacheFiles,
  readJsonCache,
  writeJsonCache,
} from "@/lib/cache/file-store";

function analysisPath(eventKey: string, matchKey: string): string[] {
  return ["analysis", eventKey, `${matchKey}.json`];
}

/** Required compare schema keys introduced for /compare. */
export const COMPARE_SCHEMA_KEYS = [
  "ai_auto",
  "ai_teleop",
  "ai_endgame",
  "climb_pct",
  "vision_conf",
  "weighted_score",
] as const;

export function hasCompareSchemaKeys(analysis: unknown): boolean {
  if (!analysis || typeof analysis !== "object") return false;
  const compareMetrics = (analysis as MatchAnalysis).compareMetrics;
  if (!compareMetrics || typeof compareMetrics !== "object") return false;
  const parsed = CompareMetricsSchema.safeParse(compareMetrics);
  return parsed.success;
}

export interface GetCachedAnalysisOptions {
  /** When false (default), analyses missing compare schema keys are bypassed. */
  allowStaleSchema?: boolean;
  /** When true, delete on-disk cache entries that fail the schema check. */
  deleteStale?: boolean;
}

export async function getCachedAnalysis(
  eventKey: string,
  matchKey: string,
  options: GetCachedAnalysisOptions = {},
): Promise<MatchAnalysis | null> {
  const cached = await readJsonCache<unknown>(analysisPath(eventKey, matchKey));
  if (!cached) return null;

  const parsed = MatchAnalysisSchema.safeParse(cached);
  if (!parsed.success) {
    if (options.deleteStale) {
      await deleteCachedAnalysis(eventKey, matchKey);
    }
    return null;
  }

  if (!options.allowStaleSchema && !hasCompareSchemaKeys(parsed.data)) {
    if (options.deleteStale) {
      await deleteCachedAnalysis(eventKey, matchKey);
    }
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

export async function deleteCachedAnalysis(
  eventKey: string,
  matchKey: string,
): Promise<boolean> {
  return deleteJsonCache(analysisPath(eventKey, matchKey));
}

export async function listCachedAnalyses(
  eventKey: string,
  options: GetCachedAnalysisOptions = {},
): Promise<CacheIndexEntry[]> {
  const matchKeys = await listJsonCacheFiles(["analysis", eventKey]);
  const entries: CacheIndexEntry[] = [];

  for (const matchKey of matchKeys) {
    const analysis = await getCachedAnalysis(eventKey, matchKey, options);
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

/**
 * Clear event analyses. When `staleOnly`, only remove entries missing compare schema keys.
 * When `all`, remove every cached analysis for the event.
 */
export async function invalidateEventAnalysisCache(
  eventKey: string,
  mode: "staleOnly" | "all" = "staleOnly",
): Promise<{ deleted: string[]; kept: string[] }> {
  const matchKeys = await listJsonCacheFiles(["analysis", eventKey]);
  const deleted: string[] = [];
  const kept: string[] = [];

  for (const matchKey of matchKeys) {
    const raw = await readJsonCache<unknown>(analysisPath(eventKey, matchKey));
    const isStale = !hasCompareSchemaKeys(raw);
    if (mode === "all" || isStale) {
      await deleteCachedAnalysis(eventKey, matchKey);
      deleted.push(matchKey);
    } else {
      kept.push(matchKey);
    }
  }

  return { deleted, kept };
}

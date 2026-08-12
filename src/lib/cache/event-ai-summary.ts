import {
  getCachedAnalysis,
  type GetCachedAnalysisOptions,
} from "@/lib/cache/analysis-store";
import { listJsonCacheFiles } from "@/lib/cache/file-store";
import type { MatchAnalysis } from "@/lib/types/analysis";
import { aggregateEventAiMetrics, type TeamAiMetrics } from "@/lib/analysis/team-metrics";

export async function loadEventAnalyses(
  eventKey: string,
  options: GetCachedAnalysisOptions = {
    allowStaleSchema: false,
    deleteStale: false,
  },
): Promise<MatchAnalysis[]> {
  const matchKeys = await listJsonCacheFiles(["analysis", eventKey]);
  const analyses: MatchAnalysis[] = [];

  for (const matchKey of matchKeys) {
    const analysis = await getCachedAnalysis(eventKey, matchKey, options);
    if (analysis) {
      analyses.push(analysis);
    }
  }

  return analyses;
}

export async function loadEventTeamAiMetrics(
  eventKey: string,
  options?: GetCachedAnalysisOptions,
): Promise<{
  eventKey: string;
  analyses: MatchAnalysis[];
  teams: TeamAiMetrics[];
}> {
  const analyses = await loadEventAnalyses(eventKey, options);
  const metrics = aggregateEventAiMetrics(analyses);
  return {
    eventKey,
    analyses,
    teams: [...metrics.values()].sort((a, b) => a.team - b.team),
  };
}

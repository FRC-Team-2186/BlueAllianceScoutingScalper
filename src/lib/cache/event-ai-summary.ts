import {
  getCachedAnalysis,
  listCachedAnalyses,
} from "@/lib/cache/analysis-store";
import type { MatchAnalysis } from "@/lib/types/analysis";
import { aggregateEventAiMetrics, type TeamAiMetrics } from "@/lib/analysis/team-metrics";

export async function loadEventAnalyses(
  eventKey: string,
): Promise<MatchAnalysis[]> {
  const entries = await listCachedAnalyses(eventKey);
  const analyses: MatchAnalysis[] = [];

  for (const entry of entries) {
    const analysis = await getCachedAnalysis(eventKey, entry.matchKey);
    if (analysis) {
      analyses.push(analysis);
    }
  }

  return analyses;
}

export async function loadEventTeamAiMetrics(
  eventKey: string,
): Promise<{
  eventKey: string;
  analyses: MatchAnalysis[];
  teams: TeamAiMetrics[];
}> {
  const analyses = await loadEventAnalyses(eventKey);
  const metrics = aggregateEventAiMetrics(analyses);
  return {
    eventKey,
    analyses,
    teams: [...metrics.values()].sort((a, b) => a.team - b.team),
  };
}

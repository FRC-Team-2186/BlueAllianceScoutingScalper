import { analyzeFramesWithGemini, GeminiVisionError } from "@/lib/analysis/gemini-vision";
import { FrameSamplerError, sampleMatchFrames } from "@/lib/analysis/frame-sampler";
import { RateLimitError } from "@/lib/analysis/rate-limiter";
import { getMatch } from "@/lib/api/tba-client";
import { extractYoutubeVideoId } from "@/lib/api/youtube";
import {
  getCachedAnalysis,
  saveAnalysisCache,
} from "@/lib/cache/analysis-store";
import { createMockAnalysis } from "@/lib/mock/mock-analysis";
import type { MatchAnalysis } from "@/lib/types/analysis";

export interface AnalyzeVideoOptions {
  matchKey: string;
  teamKey?: string;
  force?: boolean;
}

export interface AnalyzeVideoResult {
  status: "cached" | "complete" | "mock";
  analysis: MatchAnalysis;
  message?: string;
}

export async function analyzeMatchVideo(
  options: AnalyzeVideoOptions,
): Promise<AnalyzeVideoResult> {
  const match = await getMatch(options.matchKey);
  const eventKey = match.event_key;
  const focusTeamKey =
    options.teamKey ??
    match.alliances.red.team_keys[0] ??
    match.alliances.blue.team_keys[0];

  if (!options.force) {
    const cached = await getCachedAnalysis(eventKey, match.key);
    if (cached) {
      return { status: "cached", analysis: cached };
    }
  }

  const youtubeVideoId = extractYoutubeVideoId(match);
  if (!youtubeVideoId) {
    const mock = createMockAnalysis(match, focusTeamKey);
    await saveAnalysisCache(mock);
    return {
      status: "mock",
      analysis: mock,
      message: "No YouTube video available; saved mock analysis.",
    };
  }

  try {
    const frames = await sampleMatchFrames(youtubeVideoId);
    const analysis = await analyzeFramesWithGemini(
      match,
      frames,
      youtubeVideoId,
      focusTeamKey,
    );
    const saved = await saveAnalysisCache(analysis);
    return { status: "complete", analysis: saved };
  } catch (error) {
    if (
      error instanceof RateLimitError ||
      error instanceof GeminiVisionError ||
      error instanceof FrameSamplerError
    ) {
      const mock = createMockAnalysis(match, focusTeamKey);
      mock.actions[0] = {
        ...mock.actions[0],
        notes:
          error instanceof Error
            ? error.message
            : "Analysis failed; mock fallback used.",
      };
      await saveAnalysisCache(mock);
      return {
        status: "mock",
        analysis: mock,
        message:
          error instanceof Error ? error.message : "Analysis failed; mock fallback used.",
      };
    }
    throw error;
  }
}

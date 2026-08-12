import { z } from "zod";

export const AnalysisActionSchema = z.object({
  timestampSec: z.number(),
  phase: z.enum(["auto", "teleop", "endgame"]),
  teamKey: z.string(),
  action: z.string(),
  points: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

export const RobotPhasePointsSchema = z.object({
  auto: z.number(),
  teleop: z.number(),
  endgame: z.number(),
  total: z.number(),
});

/** Strict compare-table metrics guaranteed by Gemini JSON output. */
export const CompareMetricsSchema = z.object({
  ai_auto: z.number(),
  ai_teleop: z.number(),
  ai_endgame: z.number(),
  climb_pct: z.number(),
  vision_conf: z.number(),
  weighted_score: z.number(),
});

export const PhaseTimelineSchema = z.object({
  autonomous: z
    .object({
      startPosition: z.string().optional(),
      preLoadScored: z.string().optional(),
      mobility: z.string().optional(),
    })
    .optional(),
  teleop: z
    .object({
      cycleCount: z.number().optional(),
      intakeLocations: z
        .array(
          z.object({
            time: z.string(),
            location: z.string(),
          }),
        )
        .optional(),
      scoringLocations: z
        .array(
          z.object({
            time: z.string(),
            location: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
  endgame: z
    .object({
      status: z.enum(["climb", "park", "none"]).optional(),
      statusTime: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

export const MatchAnalysisSchema = z.object({
  matchKey: z.string(),
  eventKey: z.string(),
  youtubeVideoId: z.string().nullable(),
  source: z.enum(["gemini", "mock", "cache"]),
  analyzedAt: z.string(),
  model: z.string().optional(),
  /** Focus team these compare metrics describe (frc####). */
  focusTeamKey: z.string().optional(),
  /** Strict compare keys from Gemini (never null after normalize). */
  compareMetrics: CompareMetricsSchema.optional(),
  phaseTimeline: PhaseTimelineSchema.optional(),
  actions: z.array(AnalysisActionSchema),
  summary: z.object({
    autoPoints: z.record(z.string(), z.number()).optional(),
    teleopCycles: z.record(z.string(), z.number()).optional(),
    endgamePoints: z.record(z.string(), z.number()).optional(),
    defenseRating: z.record(z.string(), z.number()).optional(),
    /** Per-robot solo point contributions (preferred display metrics). */
    robotPoints: z.record(z.string(), RobotPhasePointsSchema).optional(),
  }),
  tbaVerification: z
    .object({
      redScore: z.number(),
      blueScore: z.number(),
      aiRedTotal: z.number().optional(),
      aiBlueTotal: z.number().optional(),
      delta: z.number().optional(),
    })
    .optional(),
});

export type AnalysisAction = z.infer<typeof AnalysisActionSchema>;
export type MatchAnalysis = z.infer<typeof MatchAnalysisSchema>;
export type RobotPhasePointsStored = z.infer<typeof RobotPhasePointsSchema>;
export type CompareMetrics = z.infer<typeof CompareMetricsSchema>;
export type PhaseTimeline = z.infer<typeof PhaseTimelineSchema>;

export interface CacheIndexEntry {
  matchKey: string;
  eventKey: string;
  analyzedAt: string;
  source: MatchAnalysis["source"];
  actionCount: number;
}

export function emptyCompareMetrics(): CompareMetrics {
  return {
    ai_auto: 0,
    ai_teleop: 0,
    ai_endgame: 0,
    climb_pct: 0,
    vision_conf: 0,
    weighted_score: 0,
  };
}

export function normalizeCompareMetrics(
  partial?: Partial<CompareMetrics> | null,
): CompareMetrics {
  const base = emptyCompareMetrics();
  if (!partial) return base;
  return {
    ai_auto: Number.isFinite(partial.ai_auto) ? Number(partial.ai_auto) : 0,
    ai_teleop: Number.isFinite(partial.ai_teleop) ? Number(partial.ai_teleop) : 0,
    ai_endgame: Number.isFinite(partial.ai_endgame)
      ? Number(partial.ai_endgame)
      : 0,
    climb_pct: Number.isFinite(partial.climb_pct) ? Number(partial.climb_pct) : 0,
    vision_conf: Number.isFinite(partial.vision_conf)
      ? Number(partial.vision_conf)
      : 0,
    weighted_score: Number.isFinite(partial.weighted_score)
      ? Number(partial.weighted_score)
      : 0,
  };
}

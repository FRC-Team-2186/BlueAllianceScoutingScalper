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

export const MatchAnalysisSchema = z.object({
  matchKey: z.string(),
  eventKey: z.string(),
  youtubeVideoId: z.string().nullable(),
  source: z.enum(["gemini", "mock", "cache"]),
  analyzedAt: z.string(),
  model: z.string().optional(),
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

export interface CacheIndexEntry {
  matchKey: string;
  eventKey: string;
  analyzedAt: string;
  source: MatchAnalysis["source"];
  actionCount: number;
}

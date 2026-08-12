import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";
import { z } from "zod";
import type { SampledFrame } from "@/lib/analysis/frame-sampler";
import { buildMatchAnalysisPrompt } from "@/lib/analysis/prompts";
import { getGeminiRateLimiter, RateLimitError } from "@/lib/analysis/rate-limiter";
import { APP_CONFIG, hasGeminiApiKey } from "@/lib/config";
import {
  MatchAnalysisSchema,
  normalizeCompareMetrics,
  type MatchAnalysis,
} from "@/lib/types/analysis";
import type { TbaMatch } from "@/lib/types/tba";

const GeminiResponseSchema = z.object({
  ai_auto: z.number(),
  ai_teleop: z.number(),
  ai_endgame: z.number(),
  climb_pct: z.number(),
  vision_conf: z.number(),
  weighted_score: z.number(),
  phaseTimeline: z
    .object({
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
    })
    .optional(),
  actions: z.array(
    z.object({
      timestampSec: z.number(),
      phase: z.enum(["auto", "teleop", "endgame"]),
      teamKey: z.string(),
      action: z.string(),
      points: z.number().optional(),
      confidence: z.number().min(0).max(1).optional(),
      notes: z.string().optional(),
    }),
  ),
  summary: z.object({
    autoPoints: z.record(z.string(), z.number()).optional(),
    teleopCycles: z.record(z.string(), z.number()).optional(),
    endgamePoints: z.record(z.string(), z.number()).optional(),
    defenseRating: z.record(z.string(), z.number()).optional(),
    robotPoints: z
      .record(
        z.string(),
        z.object({
          auto: z.number(),
          teleop: z.number(),
          endgame: z.number(),
          total: z.number(),
        }),
      )
      .optional(),
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

/** Gemini OpenAPI-style response schema enforcing compare metric keys. */
export const GEMINI_COMPARE_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    ai_auto: { type: SchemaType.NUMBER },
    ai_teleop: { type: SchemaType.NUMBER },
    ai_endgame: { type: SchemaType.NUMBER },
    climb_pct: { type: SchemaType.NUMBER },
    vision_conf: { type: SchemaType.NUMBER },
    weighted_score: { type: SchemaType.NUMBER },
    phaseTimeline: {
      type: SchemaType.OBJECT,
      properties: {
        autonomous: {
          type: SchemaType.OBJECT,
          properties: {
            startPosition: { type: SchemaType.STRING },
            preLoadScored: { type: SchemaType.STRING },
            mobility: { type: SchemaType.STRING },
          },
        },
        teleop: {
          type: SchemaType.OBJECT,
          properties: {
            cycleCount: { type: SchemaType.NUMBER },
            intakeLocations: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  time: { type: SchemaType.STRING },
                  location: { type: SchemaType.STRING },
                },
                required: ["time", "location"],
              },
            },
            scoringLocations: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  time: { type: SchemaType.STRING },
                  location: { type: SchemaType.STRING },
                },
                required: ["time", "location"],
              },
            },
          },
        },
        endgame: {
          type: SchemaType.OBJECT,
          properties: {
            status: { type: SchemaType.STRING },
            statusTime: { type: SchemaType.STRING },
            notes: { type: SchemaType.STRING },
          },
        },
      },
    },
    actions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          timestampSec: { type: SchemaType.NUMBER },
          phase: { type: SchemaType.STRING },
          teamKey: { type: SchemaType.STRING },
          action: { type: SchemaType.STRING },
          points: { type: SchemaType.NUMBER },
          confidence: { type: SchemaType.NUMBER },
          notes: { type: SchemaType.STRING },
        },
        required: ["timestampSec", "phase", "teamKey", "action"],
      },
    },
    summary: {
      type: SchemaType.OBJECT,
      properties: {
        // Free-form teamKey → number maps; properties kept empty for schema typing.
        autoPoints: {
          type: SchemaType.OBJECT,
          properties: {},
        },
        teleopCycles: {
          type: SchemaType.OBJECT,
          properties: {},
        },
        endgamePoints: {
          type: SchemaType.OBJECT,
          properties: {},
        },
        defenseRating: {
          type: SchemaType.OBJECT,
          properties: {},
        },
        robotPoints: {
          type: SchemaType.OBJECT,
          properties: {},
        },
      },
    },
    tbaVerification: {
      type: SchemaType.OBJECT,
      properties: {
        redScore: { type: SchemaType.NUMBER },
        blueScore: { type: SchemaType.NUMBER },
        aiRedTotal: { type: SchemaType.NUMBER },
        aiBlueTotal: { type: SchemaType.NUMBER },
        delta: { type: SchemaType.NUMBER },
      },
      required: ["redScore", "blueScore"],
    },
  },
  required: [
    "ai_auto",
    "ai_teleop",
    "ai_endgame",
    "climb_pct",
    "vision_conf",
    "weighted_score",
    "actions",
    "summary",
  ],
};

/** REST body equivalent of OpenAI-style response_format: { type: "json_object" }. */
export const GEMINI_JSON_OBJECT_RESPONSE_FORMAT = {
  type: "json_object",
} as const;

export class GeminiVisionError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "GeminiVisionError";
  }
}

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new GeminiVisionError("GEMINI_API_KEY is not configured", 503);
  }
  return key;
}

function coerceNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function ensureCompareKeys(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    ai_auto: coerceNumber(raw.ai_auto),
    ai_teleop: coerceNumber(raw.ai_teleop),
    ai_endgame: coerceNumber(raw.ai_endgame),
    climb_pct: coerceNumber(raw.climb_pct),
    vision_conf: coerceNumber(raw.vision_conf),
    weighted_score: coerceNumber(raw.weighted_score),
    actions: Array.isArray(raw.actions) ? raw.actions : [],
    summary:
      raw.summary && typeof raw.summary === "object"
        ? raw.summary
        : {
            autoPoints: {},
            teleopCycles: {},
            endgamePoints: {},
            defenseRating: {},
            robotPoints: {},
          },
  };
}

function parseGeminiJson(text: string): z.infer<typeof GeminiResponseSchema> {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new GeminiVisionError("Gemini returned non-JSON content");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new GeminiVisionError("Gemini JSON was not an object");
  }

  const withDefaults = ensureCompareKeys(parsed as Record<string, unknown>);
  const result = GeminiResponseSchema.safeParse(withDefaults);
  if (!result.success) {
    throw new GeminiVisionError(
      `Gemini JSON failed validation: ${result.error.message}`,
    );
  }
  return result.data;
}

async function analyzeWithRestApi(
  match: TbaMatch,
  frames: SampledFrame[],
  focusTeamKey?: string,
): Promise<z.infer<typeof GeminiResponseSchema>> {
  const apiKey = getGeminiApiKey();
  const prompt = buildMatchAnalysisPrompt(match, frames, focusTeamKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${APP_CONFIG.geminiModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const parts: Array<
    { text: string } | { inline_data: { mime_type: string; data: string } }
  > = [{ text: prompt }];

  for (const frame of frames) {
    parts.push({
      inline_data: {
        mime_type: frame.mimeType,
        data: frame.base64,
      },
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      // OpenAI-style response_format mapped onto Gemini generationConfig.
      response_format: GEMINI_JSON_OBJECT_RESPONSE_FORMAT,
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: GEMINI_COMPARE_RESPONSE_SCHEMA,
      },
    }),
  });

  if (response.status === 429) {
    throw new RateLimitError("Gemini free tier rate limit reached (429)");
  }

  if (!response.ok) {
    const body = await response.text();
    throw new GeminiVisionError(
      body || `Gemini REST request failed (${response.status})`,
      response.status,
    );
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new GeminiVisionError("Gemini REST response did not include text");
  }

  return parseGeminiJson(text);
}

async function analyzeWithSdk(
  match: TbaMatch,
  frames: SampledFrame[],
  focusTeamKey?: string,
): Promise<z.infer<typeof GeminiResponseSchema>> {
  const genAI = new GoogleGenerativeAI(getGeminiApiKey());
  const model = genAI.getGenerativeModel({
    model: APP_CONFIG.geminiModel,
    generationConfig: {
      temperature: 0.2,
      // Equivalent to response_format: { type: "json_object" }
      responseMimeType: "application/json",
      responseSchema: GEMINI_COMPARE_RESPONSE_SCHEMA,
    },
  });

  const prompt = buildMatchAnalysisPrompt(match, frames, focusTeamKey);
  const parts = [
    { text: prompt },
    ...frames.map((frame) => ({
      inlineData: {
        mimeType: frame.mimeType,
        data: frame.base64,
      },
    })),
  ];

  const result = await model.generateContent(parts);
  const text = result.response.text();
  if (!text) {
    throw new GeminiVisionError("Gemini SDK response did not include text");
  }
  return parseGeminiJson(text);
}

function deriveWeightedScore(metrics: {
  ai_auto: number;
  ai_teleop: number;
  ai_endgame: number;
  climb_pct: number;
  vision_conf: number;
  weighted_score: number;
}): number {
  if (Number.isFinite(metrics.weighted_score) && metrics.weighted_score !== 0) {
    return metrics.weighted_score;
  }
  return (
    metrics.ai_auto * 1.2 +
    metrics.ai_teleop * 1.5 +
    metrics.ai_endgame * 1.1 +
    metrics.climb_pct * 10 +
    metrics.vision_conf * 5
  );
}

export async function analyzeFramesWithGemini(
  match: TbaMatch,
  frames: SampledFrame[],
  youtubeVideoId: string,
  focusTeamKey?: string,
): Promise<MatchAnalysis> {
  if (!hasGeminiApiKey()) {
    throw new GeminiVisionError("GEMINI_API_KEY is not configured", 503);
  }

  await getGeminiRateLimiter().acquire();

  let parsed: z.infer<typeof GeminiResponseSchema>;
  try {
    parsed = await analyzeWithSdk(match, frames, focusTeamKey);
  } catch (sdkError) {
    if (sdkError instanceof RateLimitError) throw sdkError;
    parsed = await analyzeWithRestApi(match, frames, focusTeamKey);
  }

  const compareMetrics = normalizeCompareMetrics({
    ai_auto: parsed.ai_auto,
    ai_teleop: parsed.ai_teleop,
    ai_endgame: parsed.ai_endgame,
    climb_pct: parsed.climb_pct,
    vision_conf: parsed.vision_conf,
    weighted_score: deriveWeightedScore(parsed),
  });

  // Prefer Gemini compare metrics for the focus team in summary maps.
  const summary = { ...parsed.summary };
  if (focusTeamKey) {
    summary.autoPoints = {
      ...(summary.autoPoints ?? {}),
      [focusTeamKey]:
        summary.autoPoints?.[focusTeamKey] ?? compareMetrics.ai_auto,
    };
    summary.teleopCycles = {
      ...(summary.teleopCycles ?? {}),
      [focusTeamKey]:
        summary.teleopCycles?.[focusTeamKey] ?? compareMetrics.ai_teleop,
    };
    summary.endgamePoints = {
      ...(summary.endgamePoints ?? {}),
      [focusTeamKey]:
        summary.endgamePoints?.[focusTeamKey] ?? compareMetrics.ai_endgame,
    };
    const existingRobot = summary.robotPoints?.[focusTeamKey];
    summary.robotPoints = {
      ...(summary.robotPoints ?? {}),
      [focusTeamKey]: existingRobot ?? {
        auto: compareMetrics.ai_auto,
        teleop: compareMetrics.ai_teleop,
        endgame: compareMetrics.ai_endgame,
        total:
          compareMetrics.ai_auto +
          compareMetrics.ai_teleop +
          compareMetrics.ai_endgame,
      },
    };
  }

  return MatchAnalysisSchema.parse({
    matchKey: match.key,
    eventKey: match.event_key,
    youtubeVideoId,
    source: "gemini",
    analyzedAt: new Date().toISOString(),
    model: APP_CONFIG.geminiModel,
    focusTeamKey,
    compareMetrics,
    phaseTimeline: parsed.phaseTimeline,
    actions: parsed.actions,
    summary,
    tbaVerification: parsed.tbaVerification,
  });
}

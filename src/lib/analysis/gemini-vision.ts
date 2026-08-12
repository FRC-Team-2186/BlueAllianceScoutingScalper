import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import type { SampledFrame } from "@/lib/analysis/frame-sampler";
import { buildMatchAnalysisPrompt } from "@/lib/analysis/prompts";
import { getGeminiRateLimiter, RateLimitError } from "@/lib/analysis/rate-limiter";
import { APP_CONFIG, hasGeminiApiKey } from "@/lib/config";
import { MatchAnalysisSchema, type MatchAnalysis } from "@/lib/types/analysis";
import type { TbaMatch } from "@/lib/types/tba";

const GeminiResponseSchema = z.object({
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

  const result = GeminiResponseSchema.safeParse(parsed);
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
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
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
      responseMimeType: "application/json",
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

  return MatchAnalysisSchema.parse({
    matchKey: match.key,
    eventKey: match.event_key,
    youtubeVideoId,
    source: "gemini",
    analyzedAt: new Date().toISOString(),
    model: APP_CONFIG.geminiModel,
    actions: parsed.actions,
    summary: parsed.summary,
    tbaVerification: parsed.tbaVerification,
  });
}

import { PUBLIC_CONFIG } from "@/lib/config/public";

export const APP_CONFIG = {
  ...PUBLIC_CONFIG,
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiRpmLimit: Number(process.env.GEMINI_RPM_LIMIT ?? "10"),
} as const;

export function hasTbaApiKey(): boolean {
  return Boolean(process.env.TBA_API_KEY?.trim());
}

export function hasGeminiApiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function isMockMode(): boolean {
  return !hasTbaApiKey() || !hasGeminiApiKey();
}

export function getRuntimeConfig() {
  return {
    ...APP_CONFIG,
    mockMode: isMockMode(),
    hasTbaApiKey: hasTbaApiKey(),
    hasGeminiApiKey: hasGeminiApiKey(),
  };
}

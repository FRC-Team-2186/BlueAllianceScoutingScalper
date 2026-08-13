/**
 * Shared Statbotics EPA / win-rate extraction with cascading fallbacks.
 * Event payloads that exist but have null EPA must not short-circuit season fallback.
 */

export type StatboticsMetricSource = {
  name?: string;
  norm_epa?: { current?: number; mean?: number; recent?: number; max?: number };
  epa?:
    | number
    | null
    | {
        mean?: number;
        auto?: number;
        teleop?: number;
        endgame?: number;
        total_points?: number | { mean?: number };
        unitless?: number | { mean?: number };
        [key: string]: unknown;
      };
  win_rate?: number | null;
  record?: { winrate?: number };
  _fallback?: string;
};

export interface ExtractedStatboticsMetrics {
  epa?: number;
  auto?: number;
  teleop?: number;
  endgame?: number;
  winrate?: number;
  fallback?: string;
  nickname?: string;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function nestedMean(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return asFiniteNumber(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      asFiniteNumber(record.mean) ??
      asFiniteNumber(record.current) ??
      asFiniteNumber(record.end) ??
      asFiniteNumber(record.max)
    );
  }
  return undefined;
}

/** Pull a usable EPA number from common Statbotics v3 shapes. */
export function extractEpaValue(source: StatboticsMetricSource): number | undefined {
  const fromNorm =
    asFiniteNumber(source.norm_epa?.current) ??
    asFiniteNumber(source.norm_epa?.mean) ??
    asFiniteNumber(source.norm_epa?.recent);

  if (fromNorm != null) return fromNorm;

  if (typeof source.epa === "number") {
    return asFiniteNumber(source.epa);
  }

  if (source.epa && typeof source.epa === "object") {
    const epa = source.epa;
    return (
      asFiniteNumber(epa.mean) ??
      nestedMean(epa.total_points) ??
      nestedMean(epa.unitless) ??
      asFiniteNumber(epa.auto) ??
      asFiniteNumber(epa.teleop) ??
      asFiniteNumber(epa.endgame)
    );
  }

  return undefined;
}

export function extractWinRate(source: StatboticsMetricSource): number | undefined {
  return (
    asFiniteNumber(source.win_rate) ??
    asFiniteNumber(source.record?.winrate)
  );
}

export function extractStatboticsMetrics(
  source: StatboticsMetricSource,
): ExtractedStatboticsMetrics {
  const nested =
    source.epa && typeof source.epa === "object" ? source.epa : undefined;

  return {
    epa: extractEpaValue(source),
    auto: nested ? asFiniteNumber(nested.auto) : undefined,
    teleop: nested ? asFiniteNumber(nested.teleop) : undefined,
    endgame: nested ? asFiniteNumber(nested.endgame) : undefined,
    winrate: extractWinRate(source),
    fallback: source._fallback,
    nickname: source.name,
  };
}

/** True when EPA and/or win rate are real numbers (not null / N/A). */
export function hasUsableEpaMetrics(source: unknown): boolean {
  if (source == null || typeof source !== "object") return false;
  const metrics = extractStatboticsMetrics(source as StatboticsMetricSource);
  return metrics.epa != null || metrics.winrate != null;
}

export function yearFromEventKey(eventKey: string | undefined): number | undefined {
  if (!eventKey) return undefined;
  const year = Number.parseInt(eventKey.slice(0, 4), 10);
  return Number.isFinite(year) && year > 2000 ? year : undefined;
}

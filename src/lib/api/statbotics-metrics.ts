/**
 * Shared Statbotics EPA / win-rate extraction with cascading fallbacks.
 *
 * Prefer Statbotics v3 `epa.breakdown.*_points` and `epa.end` — never invent
 * per-robot scores by dividing alliance totals by 3.
 */

export type StatboticsMetricSource = {
  name?: string;
  norm_epa?: { current?: number; mean?: number; recent?: number; max?: number };
  epa?:
    | number
    | null
    | {
        mean?: number;
        end?: number;
        auto?: number;
        teleop?: number;
        endgame?: number;
        total_points?: number | { mean?: number };
        unitless?: number | { mean?: number };
        breakdown?: {
          total_points?: number | { mean?: number };
          auto_points?: number | { mean?: number };
          teleop_points?: number | { mean?: number };
          endgame_points?: number | { mean?: number };
          [key: string]: unknown;
        };
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

function readBreakdownField(
  epa: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  if (!epa) return undefined;
  const breakdown = epa.breakdown;
  if (!breakdown || typeof breakdown !== "object") return undefined;
  return nestedMean((breakdown as Record<string, unknown>)[key]);
}

/**
 * Total EPA from Statbotics v3:
 * `epa.breakdown.total_points` → `epa.end` → norm_epa / legacy shapes.
 */
export function extractEpaValue(source: StatboticsMetricSource): number | undefined {
  if (typeof source.epa === "number") {
    return asFiniteNumber(source.epa);
  }

  if (source.epa && typeof source.epa === "object") {
    const epa = source.epa as Record<string, unknown>;
    const fromBreakdown = readBreakdownField(epa, "total_points");
    if (fromBreakdown != null) return fromBreakdown;

    const fromEnd = asFiniteNumber(epa.end) ?? nestedMean(epa.end);
    if (fromEnd != null) return fromEnd;

    const fromTotal = nestedMean(epa.total_points);
    if (fromTotal != null) return fromTotal;

    const fromMean = asFiniteNumber(epa.mean) ?? nestedMean(epa.unitless);
    if (fromMean != null) return fromMean;
  }

  return (
    asFiniteNumber(source.norm_epa?.current) ??
    asFiniteNumber(source.norm_epa?.mean) ??
    asFiniteNumber(source.norm_epa?.recent)
  );
}

export function extractWinRate(source: StatboticsMetricSource): number | undefined {
  return (
    asFiniteNumber(source.win_rate) ??
    asFiniteNumber(source.record?.winrate)
  );
}

/**
 * Extract Total / Auto / Teleop / Endgame EPA using Statbotics breakdown fields.
 */
export function extractStatboticsMetrics(
  source: StatboticsMetricSource,
): ExtractedStatboticsMetrics {
  const epaObj =
    source.epa && typeof source.epa === "object"
      ? (source.epa as Record<string, unknown>)
      : undefined;
  const record = source as StatboticsMetricSource & {
    auto?: unknown;
    teleop?: unknown;
    endgame?: unknown;
    epa_auto?: unknown;
    epa_teleop?: unknown;
    epa_endgame?: unknown;
  };

  const auto =
    readBreakdownField(epaObj, "auto_points") ??
    (epaObj ? nestedMean(epaObj.auto) ?? asFiniteNumber(epaObj.auto) : undefined) ??
    asFiniteNumber(record.auto) ??
    nestedMean(record.epa_auto) ??
    asFiniteNumber(record.epa_auto);

  const teleop =
    readBreakdownField(epaObj, "teleop_points") ??
    (epaObj
      ? nestedMean(epaObj.teleop) ?? asFiniteNumber(epaObj.teleop)
      : undefined) ??
    asFiniteNumber(record.teleop) ??
    nestedMean(record.epa_teleop) ??
    asFiniteNumber(record.epa_teleop);

  const endgame =
    readBreakdownField(epaObj, "endgame_points") ??
    (epaObj
      ? nestedMean(epaObj.endgame) ?? asFiniteNumber(epaObj.endgame)
      : undefined) ??
    asFiniteNumber(record.endgame) ??
    nestedMean(record.epa_endgame) ??
    asFiniteNumber(record.epa_endgame);

  return {
    epa: extractEpaValue(source),
    auto,
    teleop,
    endgame,
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

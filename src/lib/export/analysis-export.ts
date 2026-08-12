import Papa from "papaparse";
import type { MatchAnalysis } from "@/lib/types/analysis";

export function exportAnalysisJson(analysis: MatchAnalysis): string {
  return JSON.stringify(analysis, null, 2);
}

export function exportAnalysisCsv(analysis: MatchAnalysis): string {
  const rows = analysis.actions.map((action) => ({
    matchKey: analysis.matchKey,
    eventKey: analysis.eventKey,
    timestampSec: action.timestampSec,
    phase: action.phase,
    teamKey: action.teamKey,
    action: action.action,
    points: action.points ?? "",
    confidence: action.confidence ?? "",
    notes: action.notes ?? "",
    source: analysis.source,
    analyzedAt: analysis.analyzedAt,
  }));

  return Papa.unparse(rows);
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Strict compare metric keys — table headers map 1:1 to these. */
export type CompareMetricKey =
  | "ai_auto"
  | "ai_teleop"
  | "ai_endgame"
  | "climb_pct"
  | "vision_conf"
  | "weighted_score";

export interface ComparisonRow {
  team: number;
  teamKey: string;
  nickname?: string;
  epa?: number;
  winrate?: number;
  autoPoints: number;
  teleopCycles: number;
  endgamePoints: number;
  defenseRating: number;
  /** Averaged single-robot TBA/AI point contributions */
  soloAuto?: number;
  soloTeleop?: number;
  soloEndgame?: number;
  soloTotal?: number;
  soloMatchCount?: number;
  soloSource?: string;
  /** Strict schema keys used by /compare headers. */
  ai_auto: number;
  ai_teleop: number;
  ai_endgame: number;
  climb_pct: number;
  vision_conf: number;
  weighted_score: number;
  verifiedVideo: boolean;
  aiMatchCount: number;
  dataSource: "verified-video" | "statbotics" | "mixed";
  epaSource?: "event" | "team-year" | "team-overall" | "none";
}

/** Coerce null/undefined metrics to 0 for numeric table cells. */
export function metricOrZero(value: number | null | undefined): number {
  return value == null || Number.isNaN(value) ? 0 : value;
}

/** Display helper: numeric → formatted string; missing → "N/A" or 0. */
export function formatCompareCell(
  value: number | null | undefined,
  options?: {
    digits?: number;
    asPercent?: boolean;
    emptyAs?: "0" | "N/A";
  },
): string {
  const emptyAs = options?.emptyAs ?? "0";
  if (value == null || Number.isNaN(value)) {
    return emptyAs === "0" ? "0" : "N/A";
  }
  if (options?.asPercent) {
    return `${Math.round(value * 100)}%`;
  }
  const digits = options?.digits ?? 1;
  return value.toFixed(digits);
}

export function exportComparisonCsv(rows: ComparisonRow[]): string {
  return Papa.unparse(
    rows.map((row) => ({
      team: row.team,
      teamKey: row.teamKey,
      nickname: row.nickname ?? "",
      epa: row.epa ?? "N/A",
      winrate: row.winrate ?? "N/A",
      ai_auto: row.ai_auto,
      ai_teleop: row.ai_teleop,
      ai_endgame: row.ai_endgame,
      climb_pct: row.climb_pct,
      vision_conf: row.vision_conf,
      weighted_score: row.weighted_score,
      verifiedVideo: row.verifiedVideo,
      dataSource: row.dataSource,
    })),
  );
}

export function exportComparisonJson(rows: ComparisonRow[]): string {
  return JSON.stringify(rows, null, 2);
}

export function computeWeightedScore(row: {
  ai_auto?: number | null;
  ai_teleop?: number | null;
  ai_endgame?: number | null;
  climb_pct?: number | null;
  vision_conf?: number | null;
  autoPoints?: number;
  teleopCycles?: number;
  endgamePoints?: number;
  defenseRating?: number;
  epa?: number;
  soloAuto?: number;
  soloTeleop?: number;
  soloEndgame?: number;
  weighted_score?: number | null;
}): number {
  if (row.weighted_score != null && Number.isFinite(row.weighted_score)) {
    return row.weighted_score;
  }

  const ai_auto = metricOrZero(
    row.ai_auto ?? row.soloAuto ?? row.autoPoints,
  );
  const ai_teleop = metricOrZero(
    row.ai_teleop ?? row.soloTeleop ?? row.teleopCycles,
  );
  const ai_endgame = metricOrZero(
    row.ai_endgame ?? row.soloEndgame ?? row.endgamePoints,
  );
  const climb_pct = metricOrZero(row.climb_pct);
  const vision_conf = metricOrZero(row.vision_conf);
  const epaComponent = (row.epa ?? 1500) / 100;
  const defense = (row.defenseRating ?? 0.5) * 10;

  return (
    ai_auto * 1.2 +
    ai_teleop * 1.5 +
    ai_endgame * 1.1 +
    climb_pct * 10 +
    vision_conf * 5 +
    epaComponent +
    defense
  );
}

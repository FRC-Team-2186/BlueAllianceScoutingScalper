import Papa from "papaparse";
import type { MatchAnalysis } from "@/lib/types/analysis";
import {
  formatRobotFeatureText,
  formatShooterCount,
  TBD_ROBOT_FEATURE,
  UNCONFIRMED_ROBOT_FEATURE,
} from "@/lib/types/analysis";

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

export type CompareSortKey =
  | "epa"
  | "epaAuto"
  | "epaTeleop"
  | "epaEndgame"
  | "winrate"
  | "ai_confidence"
  | "shooter_count";

export interface ComparisonRow {
  team: number;
  teamKey: string;
  nickname?: string;
  /** Statbotics total / norm EPA */
  epa?: number;
  epaAuto?: number;
  epaTeleop?: number;
  epaEndgame?: number;
  winrate?: number;
  /** Gemini robot features */
  drivetrain: string;
  shooter_count: number | null;
  shooter_type: string;
  endgame_mechanism: string;
  ai_confidence?: number;
  featuresConfirmed: boolean;
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
    emptyAs?: "0" | "N/A" | "TBD";
  },
): string {
  const emptyAs = options?.emptyAs ?? "0";
  if (value == null || Number.isNaN(value)) {
    if (emptyAs === "0") return "0";
    if (emptyAs === "TBD") return TBD_ROBOT_FEATURE;
    return "N/A";
  }
  if (options?.asPercent) {
    return `${Math.round(value * 100)}%`;
  }
  const digits = options?.digits ?? 1;
  return value.toFixed(digits);
}

export function formatFeatureCell(
  value: string | null | undefined,
): string {
  return formatRobotFeatureText(value);
}

export function formatShootersCell(
  count: number | null | undefined,
  confirmed: boolean,
): string {
  return formatShooterCount(count, confirmed);
}

export function exportComparisonCsv(rows: ComparisonRow[]): string {
  return Papa.unparse(
    rows.map((row) => ({
      team: row.team,
      teamKey: row.teamKey,
      nickname: row.nickname ?? "",
      epa: row.epa ?? "N/A",
      epa_auto: row.epaAuto ?? "N/A",
      epa_teleop: row.epaTeleop ?? "N/A",
      epa_endgame: row.epaEndgame ?? "N/A",
      winrate: row.winrate ?? "N/A",
      drivetrain: row.drivetrain || UNCONFIRMED_ROBOT_FEATURE,
      shooters: formatShootersCell(row.shooter_count, row.featuresConfirmed),
      shooter_type: row.shooter_type || UNCONFIRMED_ROBOT_FEATURE,
      endgame_mechanism: row.endgame_mechanism || UNCONFIRMED_ROBOT_FEATURE,
      ai_confidence: row.ai_confidence ?? "TBD",
      verifiedVideo: row.verifiedVideo,
      dataSource: row.dataSource,
    })),
  );
}

export function exportComparisonJson(rows: ComparisonRow[]): string {
  return JSON.stringify(rows, null, 2);
}

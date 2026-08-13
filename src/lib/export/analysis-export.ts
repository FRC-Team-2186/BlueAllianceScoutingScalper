import Papa from "papaparse";
import type { MatchAnalysis } from "@/lib/types/analysis";
import {
  formatRobotFeatureText,
  formatShooterCount,
  TBD_ROBOT_FEATURE,
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
  | "winrate";

export interface ComparisonRow {
  team: number;
  teamKey: string;
  nickname?: string;
  /** Statbotics total EPA from epa.breakdown.total_points / epa.end */
  epa?: number;
  epaAuto?: number;
  epaTeleop?: number;
  epaEndgame?: number;
  winrate?: number;
  /** Gemini visual robot features (text; never numeric 0 placeholders) */
  drivetrain: string;
  shooter_type: string;
  endgame_mechanism: string;
  /** Retained for exports / aggregation; not shown in the compare matrix. */
  shooter_count?: number | null;
  ai_confidence?: number;
  featuresConfirmed: boolean;
  featuresPending: boolean;
  verifiedVideo: boolean;
  aiMatchCount: number;
  dataSource: "verified-video" | "statbotics" | "mixed";
  epaSource?: "event" | "team-year" | "team-overall" | "none";
}

/** Coerce null/undefined metrics to 0 for numeric sort only. */
export function metricOrZero(value: number | null | undefined): number {
  return value == null || Number.isNaN(value) ? 0 : value;
}

/** Display helper: numeric → formatted string; missing → "N/A" or TBD. */
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
  options?: { pending?: boolean },
): string {
  return formatRobotFeatureText(value, options);
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
      rank: "",
      team: row.team,
      teamKey: row.teamKey,
      nickname: row.nickname ?? "",
      statbotics_total_epa: row.epa ?? "N/A",
      auto_epa: row.epaAuto ?? "N/A",
      teleop_epa: row.epaTeleop ?? "N/A",
      endgame_epa: row.epaEndgame ?? "N/A",
      winrate: row.winrate ?? "N/A",
      drivetrain: formatFeatureCell(row.drivetrain, {
        pending: row.featuresPending && !row.featuresConfirmed,
      }),
      shooter_type: formatFeatureCell(row.shooter_type, {
        pending: row.featuresPending && !row.featuresConfirmed,
      }),
      endgame_mechanism: formatFeatureCell(row.endgame_mechanism, {
        pending: row.featuresPending && !row.featuresConfirmed,
      }),
      verifiedVideo: row.verifiedVideo,
      dataSource: row.dataSource,
    })),
  );
}

export function exportComparisonJson(rows: ComparisonRow[]): string {
  return JSON.stringify(rows, null, 2);
}

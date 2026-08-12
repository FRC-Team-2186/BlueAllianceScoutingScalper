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
  weightedScore: number;
  aiAutoScore?: number;
  aiTeleopCycles?: number;
  aiEndgamePoints?: number;
  visionConfidence?: number;
  endgameClimbRate?: number;
  verifiedVideo: boolean;
  aiMatchCount: number;
  dataSource: "verified-video" | "statbotics" | "mixed";
  epaSource?: "event" | "team-year" | "team-overall" | "none";
}

export function exportComparisonCsv(rows: ComparisonRow[]): string {
  return Papa.unparse(rows);
}

export function exportComparisonJson(rows: ComparisonRow[]): string {
  return JSON.stringify(rows, null, 2);
}

export function computeWeightedScore(row: {
  autoPoints: number;
  teleopCycles: number;
  endgamePoints: number;
  defenseRating: number;
  epa?: number;
  aiAutoScore?: number;
  aiTeleopCycles?: number;
  aiEndgamePoints?: number;
  visionConfidence?: number;
}): number {
  const epaComponent = (row.epa ?? 1500) / 100;
  const aiBoost =
    (row.aiAutoScore ?? 0) * 0.8 +
    (row.aiTeleopCycles ?? 0) * 1.2 +
    (row.aiEndgamePoints ?? 0) * 0.9 +
    (row.visionConfidence ?? 0) * 5;

  return (
    row.autoPoints * 1.5 +
    row.teleopCycles * 2 +
    row.endgamePoints * 1.2 +
    row.defenseRating * 10 +
    epaComponent +
    aiBoost
  );
}

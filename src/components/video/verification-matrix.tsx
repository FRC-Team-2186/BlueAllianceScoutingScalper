"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { MatchAnalysis } from "@/lib/types/analysis";
import type { TbaMatch } from "@/lib/types/tba";

interface VerificationMatrixProps {
  match: TbaMatch;
  analysis: MatchAnalysis;
}

function sumTeamPoints(
  record: Record<string, number> | undefined,
  teamKeys: string[],
): number {
  if (!record) return 0;
  return teamKeys.reduce((total, teamKey) => total + (record[teamKey] ?? 0), 0);
}

export function VerificationMatrix({ match, analysis }: VerificationMatrixProps) {
  const redTeams = match.alliances.red.team_keys;
  const blueTeams = match.alliances.blue.team_keys;

  const aiRedAuto = sumTeamPoints(analysis.summary.autoPoints, redTeams);
  const aiBlueAuto = sumTeamPoints(analysis.summary.autoPoints, blueTeams);
  const aiRedTeleop = sumTeamPoints(analysis.summary.teleopCycles, redTeams);
  const aiBlueTeleop = sumTeamPoints(analysis.summary.teleopCycles, blueTeams);
  const aiRedEndgame = sumTeamPoints(analysis.summary.endgamePoints, redTeams);
  const aiBlueEndgame = sumTeamPoints(analysis.summary.endgamePoints, blueTeams);

  const tbaRed = match.alliances.red.score;
  const tbaBlue = match.alliances.blue.score;
  const aiRedTotal =
    analysis.tbaVerification?.aiRedTotal ??
    aiRedAuto + aiRedTeleop + aiRedEndgame;
  const aiBlueTotal =
    analysis.tbaVerification?.aiBlueTotal ??
    aiBlueAuto + aiBlueTeleop + aiBlueEndgame;

  const rows = [
    {
      metric: "Auto points (AI est.)",
      red: aiRedAuto,
      blue: aiBlueAuto,
      tbaRed: "—",
      tbaBlue: "—",
    },
    {
      metric: "Teleop cycles (AI est.)",
      red: aiRedTeleop,
      blue: aiBlueTeleop,
      tbaRed: "—",
      tbaBlue: "—",
    },
    {
      metric: "Endgame points (AI est.)",
      red: aiRedEndgame,
      blue: aiBlueEndgame,
      tbaRed: "—",
      tbaBlue: "—",
    },
    {
      metric: "Total score",
      red: aiRedTotal,
      blue: aiBlueTotal,
      tbaRed,
      tbaBlue,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">Video Point Verification Matrix</h3>
        <Badge variant="outline">source: {analysis.source}</Badge>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            <TableHead>AI Red</TableHead>
            <TableHead>TBA Red</TableHead>
            <TableHead>AI Blue</TableHead>
            <TableHead>TBA Blue</TableHead>
            <TableHead>Delta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const delta =
              row.metric === "Total score"
                ? Math.abs(tbaRed - aiRedTotal) + Math.abs(tbaBlue - aiBlueTotal)
                : null;

            return (
              <TableRow key={row.metric}>
                <TableCell>{row.metric}</TableCell>
                <TableCell>{row.red}</TableCell>
                <TableCell>{row.tbaRed}</TableCell>
                <TableCell>{row.blue}</TableCell>
                <TableCell>{row.tbaBlue}</TableCell>
                <TableCell>{delta ?? "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {analysis.tbaVerification?.delta !== undefined && (
        <p className="text-xs text-muted-foreground">
          Reported verification delta: {analysis.tbaVerification.delta}
        </p>
      )}
    </div>
  );
}

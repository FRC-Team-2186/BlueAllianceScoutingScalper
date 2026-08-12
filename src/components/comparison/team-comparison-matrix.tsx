"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, Eye, Loader2 } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EventYearFilters } from "@/components/dashboard/event-year-filters";
import { useEventAiSummary } from "@/hooks/use-analysis";
import { useScoutFilters } from "@/hooks/use-scout-filters";
import {
  computeWeightedScore,
  downloadTextFile,
  exportComparisonCsv,
  exportComparisonJson,
  type ComparisonRow,
} from "@/lib/export/analysis-export";
import { fetchStatboticsComparisonMetrics } from "@/lib/api/statbotics-browser";
import { PUBLIC_CONFIG } from "@/lib/config/public";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SortMetric =
  | "weightedScore"
  | "autoPoints"
  | "teleopCycles"
  | "endgamePoints"
  | "defenseRating"
  | "epa"
  | "aiAutoScore"
  | "aiTeleopCycles"
  | "aiEndgamePoints"
  | "visionConfidence";

interface TeamComparisonMatrixProps {
  initialEventKey?: string;
  initialTeams?: number[];
}

function parseTeamsInput(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((team) => Number.isFinite(team) && team > 0);
}

function DataSourceBadge({ row }: { row: ComparisonRow }) {
  if (row.verifiedVideo) {
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="size-3" />
        Verified Video
      </Badge>
    );
  }

  if (row.dataSource === "statbotics") {
    return (
      <Badge variant="outline" className="gap-1">
        <Database className="size-3" />
        Statbotics / TBA
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1">
      <Eye className="size-3" />
      Mixed
    </Badge>
  );
}

function TeamComparisonMatrixInner({
  initialTeams = [2186, 254, 1678],
}: TeamComparisonMatrixProps) {
  const { year, eventKey, setYear, setEventKey } = useScoutFilters({
    eventKey: PUBLIC_CONFIG.defaultEvent,
  });
  const [teamsInput, setTeamsInput] = useState(initialTeams.join(", "));
  const [sortMetric, setSortMetric] = useState<SortMetric>("weightedScore");
  const [teams, setTeams] = useState(initialTeams);
  const [showAiColumns, setShowAiColumns] = useState(true);

  const aiSummaryQuery = useEventAiSummary(eventKey);

  const statboticsQueries = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["comparison-statbotics", team, year, eventKey],
      queryFn: () =>
        fetchStatboticsComparisonMetrics({ team, eventKey, year }),
      enabled: Boolean(team && eventKey && year),
      staleTime: 30_000,
    })),
  });

  useEffect(() => {
    for (const [index, query] of statboticsQueries.entries()) {
      if (query.isError) {
        console.error(
          `[Compare] Statbotics metrics failed for team ${teams[index]} (${year}/${eventKey})`,
          query.error,
        );
      }
    }
    if (aiSummaryQuery.isError) {
      console.error(
        `[Compare] AI summary failed for event ${eventKey}`,
        aiSummaryQuery.error,
      );
    }
  }, [statboticsQueries, aiSummaryQuery.isError, aiSummaryQuery.error, teams, year, eventKey]);

  const rows = useMemo(() => {
    const aiByTeam = new Map(
      (aiSummaryQuery.data?.teams ?? []).map((team) => [team.teamKey, team]),
    );

    const comparisonRows: ComparisonRow[] = teams.map((team, index) => {
      const teamKey = `frc${team}`;
      const stats = statboticsQueries[index]?.data;
      const ai = aiByTeam.get(teamKey);
      const epa = stats?.epa;
      const autoPoints = ai?.aiAutoScore ?? stats?.auto ?? 0;
      const teleopCycles = ai?.aiTeleopCycles ?? stats?.teleop ?? 0;
      const endgamePoints = ai?.aiEndgamePoints ?? stats?.endgame ?? 0;
      const defenseRating = 0.5;
      const verifiedVideo = Boolean(ai?.verifiedVideo);

      const base: ComparisonRow = {
        team,
        teamKey,
        nickname: stats?.nickname,
        epa,
        winrate: stats?.winrate,
        autoPoints,
        teleopCycles,
        endgamePoints,
        defenseRating,
        weightedScore: 0,
        aiAutoScore: ai?.aiAutoScore,
        aiTeleopCycles: ai?.aiTeleopCycles,
        aiEndgamePoints: ai?.aiEndgamePoints,
        visionConfidence: ai?.visionConfidence,
        endgameClimbRate: ai?.endgameClimbRate,
        verifiedVideo,
        aiMatchCount: ai?.matchCount ?? 0,
        epaSource: stats?.source,
        dataSource: verifiedVideo
          ? "verified-video"
          : ai
            ? "mixed"
            : "statbotics",
      };

      return {
        ...base,
        weightedScore: computeWeightedScore(base),
      };
    });

    return comparisonRows.sort((a, b) => {
      const left = a[sortMetric] ?? 0;
      const right = b[sortMetric] ?? 0;
      return right - left;
    });
    // year/eventKey intentionally included so the matrix rebuilds as soon as selectors change
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selector-driven refresh
  }, [teams, year, eventKey, sortMetric, aiSummaryQuery.data, statboticsQueries]);

  function applyFilters() {
    setTeams(parseTeamsInput(teamsInput));
  }

  function handleExportJson() {
    downloadTextFile(
      `${eventKey}-comparison.json`,
      exportComparisonJson(rows),
      "application/json",
    );
  }

  function handleExportCsv() {
    downloadTextFile(
      `${eventKey}-comparison.csv`,
      exportComparisonCsv(rows),
      "text/csv",
    );
  }

  const isLoading =
    statboticsQueries.some((query) => query.isFetching) ||
    aiSummaryQuery.isFetching;

  return (
    <div className="space-y-4">
      <EventYearFilters
        teamKey={`frc${PUBLIC_CONFIG.defaultTeam}`}
        year={year}
        eventKey={eventKey}
        onYearChange={setYear}
        onEventChange={setEventKey}
      />

      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <Input
          value={teamsInput}
          onChange={(event) => setTeamsInput(event.target.value)}
          placeholder="Teams (comma separated)"
        />
        <Button onClick={applyFilters} variant="secondary">
          Apply teams
        </Button>
        <Button onClick={handleExportCsv} variant="outline">
          Export CSV
        </Button>
        <Button onClick={handleExportJson} variant="outline">
          Export JSON
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Sort by</span>
        <Select
          value={sortMetric}
          onValueChange={(value) => {
            if (value != null) setSortMetric(value as SortMetric);
          }}
        >
          <SelectTrigger className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weightedScore">Weighted score</SelectItem>
            <SelectItem value="aiAutoScore">AI Auto Score</SelectItem>
            <SelectItem value="aiTeleopCycles">AI Teleop Cycles</SelectItem>
            <SelectItem value="aiEndgamePoints">AI Endgame</SelectItem>
            <SelectItem value="visionConfidence">Vision Confidence</SelectItem>
            <SelectItem value="autoPoints">Auto points</SelectItem>
            <SelectItem value="teleopCycles">Teleop cycles</SelectItem>
            <SelectItem value="endgamePoints">Endgame points</SelectItem>
            <SelectItem value="defenseRating">Defense rating</SelectItem>
            <SelectItem value="epa">EPA</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={showAiColumns ? "default" : "outline"}
          size="sm"
          onClick={() => setShowAiColumns((value) => !value)}
        >
          {showAiColumns ? "Hide AI columns" : "Show AI columns"}
        </Button>

        {isLoading && (
          <Badge variant="outline" className="gap-1">
            <Loader2 className="size-3 animate-spin" />
            Loading metrics…
          </Badge>
        )}
        <Badge variant="secondary">
          {year} · {eventKey}
        </Badge>
        <Badge variant="secondary">
          {aiSummaryQuery.data?.analysisCount ?? 0} cached videos
        </Badge>
      </div>

      <div className="overflow-x-auto" key={`${year}-${eventKey}-${teams.join(",")}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>EPA</TableHead>
              <TableHead>Win Rate</TableHead>
              {showAiColumns && (
                <>
                  <TableHead>AI Auto</TableHead>
                  <TableHead>AI Teleop</TableHead>
                  <TableHead>AI Endgame</TableHead>
                  <TableHead>Climb %</TableHead>
                  <TableHead>Vision Conf</TableHead>
                </>
              )}
              <TableHead>Weighted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow
                key={`${year}-${eventKey}-${row.team}`}
                className={cn(row.verifiedVideo && "bg-emerald-500/5")}
              >
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <div className="font-medium">{row.team}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.nickname ?? row.teamKey}
                    {row.aiMatchCount > 0
                      ? ` · ${row.aiMatchCount} analyzed match${row.aiMatchCount === 1 ? "" : "es"}`
                      : ""}
                    {row.epaSource === "team-year"
                      ? " · season EPA fallback"
                      : row.epaSource === "team-overall"
                        ? " · overall EPA fallback"
                        : ""}
                  </div>
                </TableCell>
                <TableCell>
                  <DataSourceBadge row={row} />
                </TableCell>
                <TableCell>{row.epa?.toFixed(0) ?? "—"}</TableCell>
                <TableCell>
                  {row.winrate !== undefined
                    ? `${(row.winrate * 100).toFixed(1)}%`
                    : "—"}
                </TableCell>
                {showAiColumns && (
                  <>
                    <TableCell>
                      {row.aiAutoScore !== undefined
                        ? row.aiAutoScore.toFixed(1)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {row.aiTeleopCycles !== undefined
                        ? row.aiTeleopCycles.toFixed(1)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {row.aiEndgamePoints !== undefined
                        ? row.aiEndgamePoints.toFixed(1)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {row.endgameClimbRate !== undefined
                        ? `${Math.round(row.endgameClimbRate * 100)}%`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {row.visionConfidence !== undefined
                        ? `${Math.round(row.visionConfidence * 100)}%`
                        : "—"}
                    </TableCell>
                  </>
                )}
                <TableCell className="font-medium">
                  {row.weightedScore.toFixed(1)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function TeamComparisonMatrix(props: TeamComparisonMatrixProps) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <TeamComparisonMatrixInner {...props} />
    </Suspense>
  );
}

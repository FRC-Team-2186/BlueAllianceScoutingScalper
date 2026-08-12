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
  formatCompareCell,
  metricOrZero,
  type ComparisonRow,
  type CompareMetricKey,
} from "@/lib/export/analysis-export";
import { fetchSoloPoints } from "@/hooks/use-solo-points";
import { fetchStatboticsComparisonMetrics } from "@/lib/api/statbotics-browser";
import { PUBLIC_CONFIG } from "@/lib/config/public";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SortMetric =
  | CompareMetricKey
  | "epa"
  | "soloAuto"
  | "soloTeleop"
  | "soloEndgame"
  | "soloTotal"
  | "autoPoints"
  | "teleopCycles"
  | "endgamePoints"
  | "defenseRating";

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
  const [sortMetric, setSortMetric] = useState<SortMetric>("weighted_score");
  const [teams, setTeams] = useState(initialTeams);
  const [showAiColumns, setShowAiColumns] = useState(true);
  const [showSoloColumns, setShowSoloColumns] = useState(true);

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

  const soloQueries = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["comparison-solo-points", team, eventKey],
      queryFn: () => fetchSoloPoints(team, eventKey),
      enabled: Boolean(team && eventKey),
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
      const solo = soloQueries[index]?.data?.averages;
      const epa = stats?.epa;
      const soloAuto = solo?.auto ?? ai?.ai_auto ?? ai?.aiAutoScore;
      const soloTeleop = solo?.teleop ?? ai?.ai_teleop ?? ai?.aiTeleopCycles;
      const soloEndgame = solo?.endgame ?? ai?.ai_endgame ?? ai?.aiEndgamePoints;
      const autoPoints = metricOrZero(soloAuto ?? stats?.auto);
      const teleopCycles = metricOrZero(soloTeleop ?? stats?.teleop);
      const endgamePoints = metricOrZero(soloEndgame ?? stats?.endgame);
      const defenseRating = 0.5;
      const verifiedVideo = Boolean(ai?.verifiedVideo);

      const ai_auto = metricOrZero(ai?.ai_auto ?? ai?.aiAutoScore);
      const ai_teleop = metricOrZero(ai?.ai_teleop ?? ai?.aiTeleopCycles);
      const ai_endgame = metricOrZero(ai?.ai_endgame ?? ai?.aiEndgamePoints);
      const climb_pct = metricOrZero(ai?.climb_pct ?? ai?.endgameClimbRate);
      const vision_conf = metricOrZero(ai?.vision_conf ?? ai?.visionConfidence);

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
        soloAuto: soloAuto == null ? undefined : metricOrZero(soloAuto),
        soloTeleop: soloTeleop == null ? undefined : metricOrZero(soloTeleop),
        soloEndgame:
          soloEndgame == null ? undefined : metricOrZero(soloEndgame),
        soloTotal: solo?.total ?? (
          soloAuto != null || soloTeleop != null || soloEndgame != null
            ? metricOrZero(soloAuto) +
              metricOrZero(soloTeleop) +
              metricOrZero(soloEndgame)
            : undefined
        ),
        soloMatchCount: solo?.matchCount ?? soloQueries[index]?.data?.matchCount,
        soloSource: solo?.source,
        ai_auto,
        ai_teleop,
        ai_endgame,
        climb_pct,
        vision_conf,
        weighted_score: metricOrZero(ai?.weighted_score),
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
        weighted_score: computeWeightedScore(base),
      };
    });

    return comparisonRows.sort((a, b) => {
      const left = metricOrZero(a[sortMetric as keyof ComparisonRow] as number);
      const right = metricOrZero(b[sortMetric as keyof ComparisonRow] as number);
      return right - left;
    });
    // year/eventKey intentionally included so the matrix rebuilds as soon as selectors change
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selector-driven refresh
  }, [teams, year, eventKey, sortMetric, aiSummaryQuery.data, statboticsQueries, soloQueries]);

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
    soloQueries.some((query) => query.isFetching) ||
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
            <SelectItem value="weighted_score">weighted_score</SelectItem>
            <SelectItem value="ai_auto">ai_auto</SelectItem>
            <SelectItem value="ai_teleop">ai_teleop</SelectItem>
            <SelectItem value="ai_endgame">ai_endgame</SelectItem>
            <SelectItem value="climb_pct">climb_pct</SelectItem>
            <SelectItem value="vision_conf">vision_conf</SelectItem>
            <SelectItem value="soloAuto">Solo Auto</SelectItem>
            <SelectItem value="soloTeleop">Solo Teleop</SelectItem>
            <SelectItem value="soloEndgame">Solo Endgame</SelectItem>
            <SelectItem value="soloTotal">Solo Total</SelectItem>
            <SelectItem value="autoPoints">Auto points</SelectItem>
            <SelectItem value="teleopCycles">Teleop cycles</SelectItem>
            <SelectItem value="endgamePoints">Endgame points</SelectItem>
            <SelectItem value="defenseRating">Defense rating</SelectItem>
            <SelectItem value="epa">EPA</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={showSoloColumns ? "default" : "outline"}
          size="sm"
          onClick={() => setShowSoloColumns((value) => !value)}
        >
          {showSoloColumns ? "Hide solo points" : "Show solo points"}
        </Button>

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
              {showSoloColumns && (
                <>
                  <TableHead>Solo Auto</TableHead>
                  <TableHead>Solo Teleop</TableHead>
                  <TableHead>Solo Endgame</TableHead>
                  <TableHead>Solo Total</TableHead>
                </>
              )}
              {showAiColumns && (
                <>
                  <TableHead>ai_auto</TableHead>
                  <TableHead>ai_teleop</TableHead>
                  <TableHead>ai_endgame</TableHead>
                  <TableHead>climb_pct</TableHead>
                  <TableHead>vision_conf</TableHead>
                </>
              )}
              <TableHead>weighted_score</TableHead>
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
                    {row.soloMatchCount
                      ? ` · ${row.soloMatchCount} scored match${row.soloMatchCount === 1 ? "" : "es"}`
                      : ""}
                    {row.aiMatchCount > 0
                      ? ` · ${row.aiMatchCount} analyzed`
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
                <TableCell>
                  {formatCompareCell(row.epa, { digits: 0, emptyAs: "N/A" })}
                </TableCell>
                <TableCell>
                  {row.winrate == null
                    ? "N/A"
                    : `${(row.winrate * 100).toFixed(1)}%`}
                </TableCell>
                {showSoloColumns && (
                  <>
                    <TableCell>
                      {formatCompareCell(row.soloAuto, { emptyAs: "0" })}
                    </TableCell>
                    <TableCell>
                      {formatCompareCell(row.soloTeleop, { emptyAs: "0" })}
                    </TableCell>
                    <TableCell>
                      {formatCompareCell(row.soloEndgame, { emptyAs: "0" })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCompareCell(row.soloTotal, { emptyAs: "0" })}
                    </TableCell>
                  </>
                )}
                {showAiColumns && (
                  <>
                    <TableCell>
                      {formatCompareCell(row.ai_auto, { emptyAs: "0" })}
                    </TableCell>
                    <TableCell>
                      {formatCompareCell(row.ai_teleop, { emptyAs: "0" })}
                    </TableCell>
                    <TableCell>
                      {formatCompareCell(row.ai_endgame, { emptyAs: "0" })}
                    </TableCell>
                    <TableCell>
                      {formatCompareCell(row.climb_pct, {
                        asPercent: true,
                        emptyAs: "0",
                      })}
                    </TableCell>
                    <TableCell>
                      {formatCompareCell(row.vision_conf, {
                        asPercent: true,
                        emptyAs: "0",
                      })}
                    </TableCell>
                  </>
                )}
                <TableCell className="font-medium">
                  {formatCompareCell(row.weighted_score, { emptyAs: "0" })}
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

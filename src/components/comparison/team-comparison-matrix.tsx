"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { useHomeTeam } from "@/hooks/use-home-team";
import {
  downloadTextFile,
  exportComparisonCsv,
  exportComparisonJson,
  formatCompareCell,
  formatFeatureCell,
  formatShootersCell,
  metricOrZero,
  type ComparisonRow,
  type CompareSortKey,
} from "@/lib/export/analysis-export";
import { fetchStatboticsComparisonMetrics } from "@/lib/api/statbotics-browser";
import { ensureCompareClientSchemaVersion } from "@/lib/cache/force-refresh";
import { defaultCompareTeams } from "@/lib/home-team";
import {
  UNCONFIRMED_ROBOT_FEATURE,
  TBD_ROBOT_FEATURE,
} from "@/lib/types/analysis";
import { PUBLIC_CONFIG } from "@/lib/config/public";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SortMetric = CompareSortKey;

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

function TeamComparisonMatrixInner({
  initialTeams,
}: TeamComparisonMatrixProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const { homeTeamNumber, hydrated: homeTeamHydrated } = useHomeTeam();
  const autoAnalyzeKeyRef = useRef<string | null>(null);

  const forceFromUrl =
    searchParams.get("force") === "true" ||
    searchParams.get("force") === "1" ||
    searchParams.get("cache") === "false";
  const teamsFromUrl = searchParams.get("teams");

  const { year, eventKey, setYear, setEventKey } = useScoutFilters({
    eventKey: PUBLIC_CONFIG.defaultEvent,
  });

  const derivedTeams = useMemo(() => {
    if (teamsFromUrl) {
      const parsed = parseTeamsInput(teamsFromUrl);
      if (parsed.length > 0) return parsed;
    }
    if (initialTeams && initialTeams.length > 0) return initialTeams;
    return defaultCompareTeams(homeTeamNumber);
  }, [teamsFromUrl, initialTeams, homeTeamNumber]);

  const [teamsInput, setTeamsInput] = useState("");
  const [teamsOverride, setTeamsOverride] = useState<number[] | null>(null);
  const teams = teamsOverride ?? derivedTeams;
  const teamsInputValue =
    teamsInput || (homeTeamHydrated ? teams.join(", ") : String(homeTeamNumber));
  const [sortMetric, setSortMetric] = useState<SortMetric>("epa");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [analysisQueued, setAnalysisQueued] = useState(false);
  const force = forceFromUrl;

  useEffect(() => {
    const result = ensureCompareClientSchemaVersion();
    if (result.cleared) {
      queryClient.clear();
      toast.message("Cleared stale compare client cache (schema updated)");
    }
  }, [queryClient]);

  // Changing year / event / teams must fully re-fetch the comparison array.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["event-ai-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["comparison-statbotics"] });
  }, [year, eventKey, teams, queryClient]);

  const aiSummaryQuery = useEventAiSummary(eventKey, { force });
  const analysisCount = aiSummaryQuery.data?.analysisCount ?? 0;
  const showAutoAnalyzing = analysisQueued && analysisCount === 0;

  // When schema-valid video cache is empty, queue Gemini analysis for TBA videos.
  useEffect(() => {
    if (!aiSummaryQuery.isSuccess || teams.length === 0) return;
    if (analysisCount > 0) return;

    const key = `${eventKey}:${teams.join(",")}`;
    if (autoAnalyzeKeyRef.current === key) return;
    autoAnalyzeKeyRef.current = key;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    void (async () => {
      const toastId = toast.loading(
        "No schema-valid videos yet — queueing background Gemini analysis…",
      );
      try {
        const response = await fetch(`/api/analyze/event?force=true`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            eventKey,
            teams,
            force: true,
            staleOnly: true,
            limit: Math.max(8, teams.length * 4),
          }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
          queued?: unknown[];
        };
        if (!response.ok && response.status !== 202) {
          throw new Error(body.error ?? "Failed to queue video analysis");
        }
        if (cancelled) return;
        setAnalysisQueued(true);
        toast.success(
          body.message ??
            `Queued ${(body.queued ?? []).length} match video(s) for analysis`,
          { id: toastId },
        );

        pollTimer = setInterval(() => {
          void queryClient.invalidateQueries({
            queryKey: ["event-ai-summary", eventKey],
          });
        }, 8_000);
        setTimeout(() => {
          if (pollTimer) clearInterval(pollTimer);
        }, 120_000);
      } catch (error) {
        if (cancelled) return;
        autoAnalyzeKeyRef.current = null;
        setAnalysisQueued(false);
        toast.error(
          error instanceof Error ? error.message : "Auto video analysis failed",
          { id: toastId },
        );
      }
    })();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [
    aiSummaryQuery.isSuccess,
    analysisCount,
    eventKey,
    teams,
    queryClient,
  ]);

  const statboticsQueries = useQueries({
    queries: teams.map((team) => ({
      queryKey: [
        "comparison-statbotics",
        team,
        year,
        eventKey,
        force ? "force" : "cache",
        refreshNonce,
      ],
      queryFn: () =>
        fetchStatboticsComparisonMetrics({
          team,
          eventKey,
          year,
          force,
        }),
      enabled: Boolean(team && eventKey && year),
      staleTime: force ? 0 : 30_000,
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
      const verifiedVideo = Boolean(ai?.verifiedVideo);
      const featuresConfirmed = Boolean(ai?.featuresConfirmed);

      return {
        team,
        teamKey,
        nickname: stats?.nickname,
        epa: stats?.epa,
        epaAuto: stats?.auto,
        epaTeleop: stats?.teleop,
        epaEndgame: stats?.endgame,
        winrate: stats?.winrate,
        drivetrain: featuresConfirmed
          ? formatFeatureCell(ai?.drivetrain)
          : UNCONFIRMED_ROBOT_FEATURE,
        shooter_count: featuresConfirmed ? (ai?.shooter_count ?? null) : null,
        shooter_type: featuresConfirmed
          ? formatFeatureCell(ai?.shooter_type)
          : UNCONFIRMED_ROBOT_FEATURE,
        endgame_mechanism: featuresConfirmed
          ? formatFeatureCell(ai?.endgame_mechanism)
          : UNCONFIRMED_ROBOT_FEATURE,
        ai_confidence: featuresConfirmed
          ? (ai?.ai_confidence ?? ai?.vision_conf ?? ai?.visionConfidence)
          : undefined,
        featuresConfirmed,
        verifiedVideo,
        aiMatchCount: ai?.matchCount ?? 0,
        epaSource: stats?.source,
        dataSource: verifiedVideo
          ? "verified-video"
          : ai
            ? "mixed"
            : "statbotics",
      };
    });

    return comparisonRows.sort((a, b) => {
      const left = metricOrZero(a[sortMetric] as number | undefined);
      const right = metricOrZero(b[sortMetric] as number | undefined);
      return right - left;
    });
    // year/eventKey/refreshNonce force a full matrix rebuild when filters or force-refresh change
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selector-driven refresh
  }, [
    teams,
    year,
    eventKey,
    sortMetric,
    aiSummaryQuery.data,
    statboticsQueries,
    refreshNonce,
  ]);

  function applyFilters() {
    const next = parseTeamsInput(teamsInputValue);
    setTeamsOverride(next);
    setTeamsInput(next.join(", "));
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) {
      params.set("teams", next.join(","));
    } else {
      params.delete("teams");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setForceInUrl(enabled: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (enabled) {
      params.set("force", "true");
      params.delete("cache");
    } else {
      params.delete("force");
      params.delete("cache");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function handleForceRefresh() {
    startRefreshTransition(() => {
      void (async () => {
        const toastId = toast.loading("Force refreshing compare data…");
        try {
          ensureCompareClientSchemaVersion();
          setForceInUrl(true);

          // Clear stale server analysis cache and re-queue Gemini for selected teams.
          const invalidate = await fetch(
            `/api/cache/analysis/${encodeURIComponent(eventKey)}?force=true&staleOnly=true`,
            { method: "DELETE", cache: "no-store" },
          );
          if (!invalidate.ok) {
            throw new Error("Failed to invalidate analysis cache");
          }

          const reanalyze = await fetch(
            `/api/analyze/event?force=true`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({
                eventKey,
                teams,
                force: true,
                staleOnly: true,
                limit: Math.max(6, teams.length * 4),
              }),
            },
          );

          const reanalyzeBody = await reanalyze.json().catch(() => ({}));
          if (!reanalyze.ok && reanalyze.status !== 202) {
            throw new Error(
              (reanalyzeBody as { error?: string }).error ??
                "Failed to queue video re-analysis",
            );
          }

          await queryClient.invalidateQueries({ queryKey: ["event-ai-summary"] });
          await queryClient.invalidateQueries({
            queryKey: ["comparison-statbotics"],
          });

          setRefreshNonce((value) => value + 1);

          toast.success(
            (reanalyzeBody as { message?: string }).message ??
              "Force refresh started",
            { id: toastId },
          );
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Force refresh failed",
            { id: toastId },
          );
        }
      })();
    });
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
    isRefreshing ||
    statboticsQueries.some((query) => query.isFetching) ||
    aiSummaryQuery.isFetching;

  return (
    <div className="space-y-4">
      <EventYearFilters
        teamKey={`frc${homeTeamNumber}`}
        year={year}
        eventKey={eventKey}
        onYearChange={setYear}
        onEventChange={setEventKey}
      />

      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <Input
          value={teamsInputValue}
          onChange={(event) => setTeamsInput(event.target.value)}
          placeholder="Teams (comma separated)"
        />
        <Button onClick={applyFilters} variant="secondary">
          Apply teams
        </Button>
        <Button
          onClick={() => void handleForceRefresh()}
          variant="default"
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Force Refresh
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
            <SelectItem value="epa">Statbotics EPA</SelectItem>
            <SelectItem value="epaAuto">Auto EPA</SelectItem>
            <SelectItem value="epaTeleop">Teleop EPA</SelectItem>
            <SelectItem value="epaEndgame">Endgame EPA</SelectItem>
            <SelectItem value="winrate">Win Rate</SelectItem>
            <SelectItem value="ai_confidence">AI Conf</SelectItem>
            <SelectItem value="shooter_count">Shooters</SelectItem>
          </SelectContent>
        </Select>

        {force && (
          <Badge variant="destructive">force refresh</Badge>
        )}
        {showAutoAnalyzing && (
          <Badge variant="outline" className="gap-1">
            <Loader2 className="size-3 animate-spin" />
            Analyzing videos…
          </Badge>
        )}
        <Badge variant="secondary">Home {homeTeamNumber}</Badge>
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
          {aiSummaryQuery.data?.analysisCount ?? 0} schema-valid videos
        </Badge>
      </div>

      <div
        className="overflow-x-auto"
        key={`${year}-${eventKey}-${teams.join(",")}-${refreshNonce}`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Statbotics EPA</TableHead>
              <TableHead>Auto EPA</TableHead>
              <TableHead>Teleop EPA</TableHead>
              <TableHead>Endgame EPA</TableHead>
              <TableHead>Win Rate</TableHead>
              <TableHead>Drivetrain</TableHead>
              <TableHead>Shooters</TableHead>
              <TableHead>Shooter Type</TableHead>
              <TableHead>Endgame Mechanism</TableHead>
              <TableHead>AI Conf</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow
                key={`${year}-${eventKey}-${row.team}-${refreshNonce}`}
                className={cn(row.verifiedVideo && "bg-emerald-500/5")}
              >
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <div className="font-medium">{row.team}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.nickname ?? row.teamKey}
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
                  {formatCompareCell(row.epa, { digits: 1, emptyAs: "N/A" })}
                </TableCell>
                <TableCell>
                  {formatCompareCell(row.epaAuto, { digits: 1, emptyAs: "N/A" })}
                </TableCell>
                <TableCell>
                  {formatCompareCell(row.epaTeleop, {
                    digits: 1,
                    emptyAs: "N/A",
                  })}
                </TableCell>
                <TableCell>
                  {formatCompareCell(row.epaEndgame, {
                    digits: 1,
                    emptyAs: "N/A",
                  })}
                </TableCell>
                <TableCell>
                  {row.winrate == null
                    ? "N/A"
                    : `${(row.winrate * 100).toFixed(1)}%`}
                </TableCell>
                <TableCell>{formatFeatureCell(row.drivetrain)}</TableCell>
                <TableCell>
                  {formatShootersCell(row.shooter_count, row.featuresConfirmed)}
                </TableCell>
                <TableCell>{formatFeatureCell(row.shooter_type)}</TableCell>
                <TableCell>
                  {formatFeatureCell(row.endgame_mechanism)}
                </TableCell>
                <TableCell>
                  {row.featuresConfirmed
                    ? formatCompareCell(row.ai_confidence, {
                        asPercent: true,
                        emptyAs: "TBD",
                      })
                    : TBD_ROBOT_FEATURE}
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

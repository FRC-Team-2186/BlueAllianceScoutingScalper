"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EventYearFilters } from "@/components/dashboard/event-year-filters";
import { useScoutFilters } from "@/hooks/use-scout-filters";
import {
  useRuntimeConfig,
  useTbaTeam,
  useTbaTeamEventMatches,
} from "@/hooks/use-tba";
import { useStatboticsTeam } from "@/hooks/use-statbotics";
import { useEventAiSummary } from "@/hooks/use-analysis";
import { sortMatchesChronologically } from "@/lib/api/match-sort";
import { extractYoutubeVideoId } from "@/lib/api/youtube";
import { PUBLIC_CONFIG } from "@/lib/config/public";

function StatusBadge({
  loading,
  error,
  label,
}: {
  loading: boolean;
  error: boolean;
  label: string;
}) {
  if (loading) return <Skeleton className="h-5 w-20" />;
  if (error) return <Badge variant="destructive">{label} Error</Badge>;
  return <Badge variant="secondary">{label} OK</Badge>;
}

function DashboardShellInner() {
  const teamNumber = PUBLIC_CONFIG.defaultTeam;
  const teamKey = `frc${teamNumber}`;
  const { year, eventKey, setYear, setEventKey } = useScoutFilters();

  const configQuery = useRuntimeConfig();
  const teamQuery = useTbaTeam(teamKey);
  const statboticsQuery = useStatboticsTeam(teamNumber);
  const matchesQuery = useTbaTeamEventMatches(teamKey, eventKey);
  const aiSummaryQuery = useEventAiSummary(eventKey);

  const matches = sortMatchesChronologically(matchesQuery.data ?? []);
  const matchesWithVideo = matches.filter((match) => extractYoutubeVideoId(match));
  const verifiedTeams = aiSummaryQuery.data?.teams.filter((team) => team.verifiedVideo) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              FRC Scouting · {year} Season
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Team {teamNumber} Scout Dashboard
            </h1>
            <p className="text-muted-foreground">
              Event: {eventKey}
              {year === 2025 ? " · REEFSCAPE" : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {configQuery.data?.mockMode ? (
              <Badge variant="outline">Mock mode enabled</Badge>
            ) : (
              <Badge>Live API mode</Badge>
            )}
            <Link
              href={`/compare?year=${year}&event=${eventKey}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Compare teams
            </Link>
            <Link
              href={`/teams/${teamNumber}?year=${year}&event=${eventKey}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Team profile
            </Link>
          </div>
        </div>

        <EventYearFilters
          teamKey={teamKey}
          year={year}
          eventKey={eventKey}
          onYearChange={setYear}
          onEventChange={setEventKey}
        />
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Runtime</CardTitle>
            <CardDescription>API key status and active filters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>TBA key</span>
              <Badge variant={configQuery.data?.hasTbaApiKey ? "default" : "outline"}>
                {configQuery.data?.hasTbaApiKey ? "Present" : "Missing"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>Gemini key</span>
              <Badge
                variant={configQuery.data?.hasGeminiApiKey ? "default" : "outline"}
              >
                {configQuery.data?.hasGeminiApiKey ? "Present" : "Missing"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>Selected year</span>
              <span>{year}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>TBA Team</CardTitle>
            <CardDescription>The Blue Alliance profile</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {teamQuery.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : teamQuery.isError ? (
              <p className="text-sm text-muted-foreground">
                TBA data unavailable without `TBA_API_KEY`. Mock UI remains usable.
              </p>
            ) : (
              <>
                <p className="font-medium">{teamQuery.data?.nickname}</p>
                <p className="text-sm text-muted-foreground">{teamQuery.data?.name}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Statbotics EPA</CardTitle>
            <CardDescription>Public v3 metrics (no key required)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {statboticsQuery.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : !statboticsQuery.data ? (
              <p className="text-sm text-muted-foreground">
                No Statbotics data yet for this season. Switch to 2025 to test with
                historical EPA.
              </p>
            ) : (
              <>
                <p className="text-2xl font-semibold">
                  {statboticsQuery.data.norm_epa.current.toFixed(0)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Win rate {(statboticsQuery.data.record.winrate * 100).toFixed(1)}%
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Integration Health</CardTitle>
          <CardDescription>
            Video analysis + API status for {eventKey}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <StatusBadge
            loading={configQuery.isLoading}
            error={configQuery.isError}
            label="Config"
          />
          <StatusBadge
            loading={teamQuery.isLoading}
            error={teamQuery.isError}
            label="TBA"
          />
          <StatusBadge
            loading={statboticsQuery.isLoading}
            error={statboticsQuery.isError}
            label="Statbotics"
          />
          <StatusBadge
            loading={matchesQuery.isLoading}
            error={matchesQuery.isError}
            label="Matches"
          />
          <Badge variant="secondary">
            {aiSummaryQuery.data?.analysisCount ?? 0} cached analyses
          </Badge>
          {verifiedTeams.length > 0 && (
            <Badge>{verifiedTeams.length} teams with verified video</Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Match List</CardTitle>
          <CardDescription>
            {matchesWithVideo.length} of {matches.length} matches have YouTube keys
            from TBA · switch year to 2025 if {year} data is sparse
          </CardDescription>
        </CardHeader>
        <CardContent>
          {matchesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading matches for {eventKey}…
            </div>
          ) : matchesQuery.isError ? (
            <p className="text-sm text-muted-foreground">
              Match list requires TBA API access for event {eventKey}. Try another
              event or year.
            </p>
          ) : matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No matches returned yet for {eventKey}. Use the year selector to try
              2025 REEFSCAPE events.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Video</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.slice(0, 20).map((match) => {
                  const videoId = extractYoutubeVideoId(match);
                  return (
                    <TableRow key={match.key}>
                      <TableCell>
                        {videoId ? (
                          <Link
                            href={`/matches/${match.key}?team=${teamNumber}&year=${year}&event=${eventKey}`}
                            className={buttonVariants({
                              variant: "link",
                              size: "sm",
                            })}
                          >
                            Analyze
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{match.key}</TableCell>
                      <TableCell>
                        {match.comp_level.toUpperCase()} {match.match_number}
                      </TableCell>
                      <TableCell>
                        {match.alliances.red.score} - {match.alliances.blue.score}
                      </TableCell>
                      <TableCell>
                        {videoId ? (
                          <Badge variant="secondary">{videoId}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardShell() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <DashboardShellInner />
    </Suspense>
  );
}

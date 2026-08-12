"use client";

import Link from "next/link";
import { Suspense } from "react";
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
import { useSoloPoints } from "@/hooks/use-solo-points";
import { useStatboticsTeam } from "@/hooks/use-statbotics";
import { useTbaTeam, useTbaTeamEventMatches } from "@/hooks/use-tba";
import { extractYoutubeVideoId } from "@/lib/api/youtube";

interface TeamProfileViewProps {
  teamNumber: number;
}

function TeamProfileInner({ teamNumber }: TeamProfileViewProps) {
  const teamKey = `frc${teamNumber}`;
  const { year, eventKey, setYear, setEventKey } = useScoutFilters();
  const teamQuery = useTbaTeam(teamKey);
  const statboticsQuery = useStatboticsTeam(teamNumber);
  const matchesQuery = useTbaTeamEventMatches(teamKey, eventKey);
  const soloQuery = useSoloPoints(teamNumber, eventKey);

  const matches = matchesQuery.data ?? [];
  const averages = soloQuery.data?.averages;
  const perMatch = soloQuery.data?.matches ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Team profile · {year}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Team {teamNumber}
              {teamQuery.data?.nickname ? ` — ${teamQuery.data.nickname}` : ""}
            </h1>
            <p className="text-muted-foreground">
              {teamQuery.data?.city}
              {teamQuery.data?.state_prov ? `, ${teamQuery.data.state_prov}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{teamKey}</Badge>
            <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Dashboard
            </Link>
            <Link
              href={`/compare?year=${year}&event=${eventKey}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Compare
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
            <CardTitle>Solo Auto</CardTitle>
            <CardDescription>Individual auto contribution avg</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {averages ? averages.auto.toFixed(1) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Solo Teleop</CardTitle>
            <CardDescription>Individual teleop contribution avg</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {averages ? averages.teleop.toFixed(1) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Solo Endgame</CardTitle>
            <CardDescription>Climb/park points avg</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {averages ? averages.endgame.toFixed(1) : "—"}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Point totals</CardTitle>
            <CardDescription>
              Averaged across {soloQuery.data?.matchCount ?? 0} matches at {eventKey}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Solo total</span>
              <span className="font-medium">
                {averages ? averages.total.toFixed(1) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Source</span>
              <Badge variant="outline">{averages?.source ?? "n/a"}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Statbotics EPA</span>
              <span>
                {statboticsQuery.data &&
                typeof statboticsQuery.data === "object" &&
                "norm_epa" in statboticsQuery.data &&
                statboticsQuery.data.norm_epa
                  ? Number(
                      (statboticsQuery.data.norm_epa as { current?: number }).current ??
                        0,
                    ).toFixed(0)
                  : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event matches</CardTitle>
            <CardDescription>
              {matches.filter((m) => extractYoutubeVideoId(m)).length} with YouTube
            </CardDescription>
          </CardHeader>
          <CardContent>
            {matchesQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No official-event matches found for {eventKey}.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {matches.slice(0, 8).map((match) => (
                  <li key={match.key} className="flex justify-between gap-2">
                    <Link
                      href={`/matches/${match.key}?team=${teamNumber}&year=${year}&event=${eventKey}`}
                      className="font-mono text-xs underline-offset-2 hover:underline"
                    >
                      {match.key}
                    </Link>
                    <span className="text-muted-foreground">
                      {match.alliances.red.score}-{match.alliances.blue.score}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Per-match solo point breakdown</CardTitle>
          <CardDescription>
            Auto / Teleop / Endgame attributed to {teamKey} (AI preferred when
            cached; otherwise TBA per-robot + estimated teleop share).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {soloQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : perMatch.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No solo point rows yet for this event.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match</TableHead>
                  <TableHead>Station</TableHead>
                  <TableHead>Auto</TableHead>
                  <TableHead>Teleop</TableHead>
                  <TableHead>Endgame</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perMatch.map((row) => (
                  <TableRow key={row.matchKey}>
                    <TableCell>
                      <Link
                        href={`/matches/${row.matchKey}?team=${teamNumber}`}
                        className="font-mono text-xs underline-offset-2 hover:underline"
                      >
                        {row.matchKey}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {row.alliance} {row.station}
                    </TableCell>
                    <TableCell>{row.auto.toFixed(1)}</TableCell>
                    <TableCell>{row.teleop.toFixed(1)}</TableCell>
                    <TableCell>{row.endgame.toFixed(1)}</TableCell>
                    <TableCell className="font-medium">{row.total.toFixed(1)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.source}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function TeamProfileView({ teamNumber }: TeamProfileViewProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6">
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <TeamProfileInner teamNumber={teamNumber} />
    </Suspense>
  );
}

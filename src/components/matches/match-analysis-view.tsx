"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchVideoPlayer } from "@/components/video/match-video-player";
import { VerificationMatrix } from "@/components/video/verification-matrix";
import { useAnalyzeVideo, useMatchAnalysis } from "@/hooks/use-analysis";
import { fetchTbaMatch } from "@/lib/api/tba-browser";
import { extractYoutubeVideoId } from "@/lib/api/youtube";
import {
  downloadTextFile,
  exportAnalysisCsv,
  exportAnalysisJson,
} from "@/lib/export/analysis-export";
import { useQuery } from "@tanstack/react-query";
import { buttonVariants } from "@/components/ui/button";
import { PUBLIC_CONFIG } from "@/lib/config/public";
import { cn } from "@/lib/utils";

interface MatchAnalysisViewProps {
  matchKey: string;
  teamKey?: string;
}

export function MatchAnalysisView({ matchKey, teamKey }: MatchAnalysisViewProps) {
  const matchQuery = useQuery({
    queryKey: ["tba-match", matchKey],
    queryFn: () => fetchTbaMatch(matchKey),
  });

  const eventKey = matchQuery.data?.event_key ?? "";
  const analysisQuery = useMatchAnalysis(eventKey, matchKey);
  const analyzeMutation = useAnalyzeVideo();

  const focusTeamKey =
    teamKey ??
    matchQuery.data?.alliances.red.team_keys[0] ??
    `frc${PUBLIC_CONFIG.defaultTeam}`;

  const isAnalyzing = analyzeMutation.isPending;

  async function handleAnalyze(force = false) {
    if (!matchQuery.data) return;

    await analyzeMutation.mutateAsync({
      matchKey,
      eventKey: matchQuery.data.event_key,
      teamKey: focusTeamKey,
      force,
      async: true,
    });
  }

  if (matchQuery.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (matchQuery.isError || !matchQuery.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Match unavailable</CardTitle>
          <CardDescription>
            Could not load `{matchKey}` from TBA. Check your API key and match key.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const match = matchQuery.data;
  const videoId = extractYoutubeVideoId(match);
  const analysis = analysisQuery.data;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{match.event_key}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{match.key}</h1>
          <p className="text-muted-foreground">
            {match.comp_level.toUpperCase()} {match.match_number} ·{" "}
            {match.alliances.red.score} - {match.alliances.blue.score}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/?year=${match.event_key.slice(0, 4)}&event=${match.event_key}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Dashboard
          </Link>
          <Link
            href={`/compare?year=${match.event_key.slice(0, 4)}&event=${match.event_key}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Compare teams
          </Link>
          <Button
            size="sm"
            onClick={() => handleAnalyze(false)}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Analyzing…
              </span>
            ) : (
              "Analyze Match"
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAnalyze(true)}
            disabled={isAnalyzing}
          >
            Re-analyze
          </Button>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className={cn(isAnalyzing && "ring-1 ring-primary/30")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Match Replay
              {isAnalyzing && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
            </CardTitle>
            <CardDescription>
              {videoId ? `YouTube video ${videoId}` : "No YouTube video key on TBA"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {videoId ? (
              <MatchVideoPlayer
                videoId={videoId}
                actions={analysis?.actions ?? []}
                focusTeamKey={focusTeamKey}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                TBA has not linked a YouTube recording for this match yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className={cn(isAnalyzing && "ring-1 ring-primary/30")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Analysis Status
              {isAnalyzing && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
            </CardTitle>
            <CardDescription>
              Cached results are reused automatically to stay within Gemini free tier
              limits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {isAnalyzing && (
              <div className="rounded-lg border border-dashed bg-muted/40 p-3">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <Loader2 className="size-4 animate-spin" />
                  Job in progress
                </div>
                <p className="text-muted-foreground">
                  Sampling frames with yt-dlp/ffmpeg, then sending a batched request to
                  Gemini. This card updates when the job completes.
                </p>
              </div>
            )}

            {analysisQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : analysis ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge>{analysis.source}</Badge>
                  {analysis.model && <Badge variant="outline">{analysis.model}</Badge>}
                  <Badge variant="secondary">{analysis.actions.length} actions</Badge>
                  {(analysis.source === "gemini" || analysis.source === "cache") && (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      Verified Video
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground">
                  Analyzed {new Date(analysis.analyzedAt).toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      downloadTextFile(
                        `${match.key}.json`,
                        exportAnalysisJson(analysis),
                        "application/json",
                      )
                    }
                  >
                    Export JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      downloadTextFile(
                        `${match.key}.csv`,
                        exportAnalysisCsv(analysis),
                        "text/csv",
                      )
                    }
                  >
                    Export CSV
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                No cached analysis yet. Click Analyze Match to sample frames and run
                Gemini vision.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle>Point Verification</CardTitle>
            <CardDescription>
              Compare TBA alliance totals against AI-detected contributions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VerificationMatrix match={match} analysis={analysis} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { getYoutubeEmbedUrl } from "@/lib/api/youtube";
import type { AnalysisAction } from "@/lib/types/analysis";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YtPlayer }) => void;
          };
        },
      ) => YtPlayer;
      PlayerState?: {
        PLAYING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YtPlayer {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  destroy: () => void;
}

interface MatchVideoPlayerProps {
  videoId: string;
  actions: AnalysisAction[];
  focusTeamKey?: string;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function phaseColor(phase: AnalysisAction["phase"]): string {
  switch (phase) {
    case "auto":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    case "teleop":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "endgame":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

export function MatchVideoPlayer({
  videoId,
  actions,
  focusTeamKey,
}: MatchVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const [activeTimestamp, setActiveTimestamp] = useState<number | null>(null);
  const [playerReady, setPlayerReady] = useState(false);

  const sortedActions = [...actions].sort(
    (a, b) => a.timestampSec - b.timestampSec,
  );

  useEffect(() => {
    let cancelled = false;

    function initPlayer() {
      if (cancelled || !containerRef.current || !window.YT?.Player) return;

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
        },
        events: {
          onReady: () => {
            if (!cancelled) setPlayerReady(true);
          },
        },
      });
    }

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const existing = document.getElementById("youtube-iframe-api");
      if (!existing) {
        const script = document.createElement("script");
        script.id = "youtube-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(script);
      }

      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  function seekTo(seconds: number) {
    setActiveTimestamp(seconds);
    if (playerReady && playerRef.current) {
      playerRef.current.seekTo(seconds, true);
      return;
    }

    if (containerRef.current) {
      containerRef.current.innerHTML = "";
      const iframe = document.createElement("iframe");
      iframe.src = getYoutubeEmbedUrl(videoId, seconds);
      iframe.className = "aspect-video h-full w-full rounded-lg border";
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      containerRef.current.appendChild(iframe);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border bg-black">
        <div ref={containerRef} className="aspect-video w-full" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">AI Timestamp Markers</h3>
          <Badge variant="outline">{sortedActions.length} actions</Badge>
        </div>

        {sortedActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Run video analysis to generate timestamp markers.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {sortedActions.map((action, index) => (
              <button
                key={`${action.timestampSec}-${action.teamKey}-${index}`}
                type="button"
                onClick={() => seekTo(action.timestampSec)}
                className={cn(
                  "rounded-lg border p-3 text-left transition hover:bg-muted/60",
                  activeTimestamp === action.timestampSec && "border-primary bg-muted/40",
                  focusTeamKey &&
                    action.teamKey === focusTeamKey &&
                    "ring-1 ring-primary/30",
                )}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold">
                    {formatTimestamp(action.timestampSec)}
                  </span>
                  <Badge className={phaseColor(action.phase)} variant="secondary">
                    {action.phase}
                  </Badge>
                  <Badge variant="outline">{action.teamKey}</Badge>
                </div>
                <p className="text-sm">{action.action}</p>
                {(action.points !== undefined || action.confidence !== undefined) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {action.points !== undefined ? `${action.points} pts` : null}
                    {action.points !== undefined && action.confidence !== undefined
                      ? " · "
                      : null}
                    {action.confidence !== undefined
                      ? `${Math.round(action.confidence * 100)}% conf`
                      : null}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

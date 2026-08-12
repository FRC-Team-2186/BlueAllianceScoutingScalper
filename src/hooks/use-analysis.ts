"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MatchAnalysis } from "@/lib/types/analysis";
import type { AnalysisJob } from "@/lib/cache/job-store";
import type { TeamAiMetrics } from "@/lib/analysis/team-metrics";

interface AnalyzeVideoResponse {
  status: "cached" | "complete" | "mock" | "processing";
  job?: AnalysisJob;
  analysis?: MatchAnalysis;
  message?: string;
}

interface EventAiSummaryResponse {
  eventKey: string;
  teams: TeamAiMetrics[];
  analysisCount: number;
}

async function fetchCachedAnalysis(eventKey: string, matchKey: string) {
  const response = await fetch(`/api/cache/analysis/${eventKey}/${matchKey}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error("Failed to load cached analysis");
  }
  return response.json() as Promise<MatchAnalysis>;
}

async function pollAnalysisJob(matchKey: string): Promise<AnalyzeVideoResponse> {
  const response = await fetch(
    `/api/analyze/video?matchKey=${encodeURIComponent(matchKey)}`,
  );
  if (!response.ok) {
    throw new Error("Failed to poll analysis job");
  }
  const payload = (await response.json()) as {
    job: AnalysisJob;
    analysis?: MatchAnalysis;
  };

  if (payload.job.status === "complete") {
    return {
      status: payload.job.resultStatus ?? "complete",
      job: payload.job,
      analysis: payload.analysis,
    };
  }

  if (payload.job.status === "failed") {
    throw new Error(payload.job.error ?? "Analysis job failed");
  }

  return { status: "processing", job: payload.job };
}

export function useMatchAnalysis(eventKey: string, matchKey: string) {
  return useQuery({
    queryKey: ["match-analysis", eventKey, matchKey],
    queryFn: () => fetchCachedAnalysis(eventKey, matchKey),
    enabled: Boolean(eventKey && matchKey),
  });
}

export function useEventAiSummary(eventKey: string, options?: { force?: boolean }) {
  const force = Boolean(options?.force);
  return useQuery({
    queryKey: ["event-ai-summary", eventKey, force ? "force" : "cache"],
    queryFn: async () => {
      const search = new URLSearchParams({ include: "summary" });
      if (force) search.set("force", "true");
      const response = await fetch(
        `/api/cache/analysis/${eventKey}?${search.toString()}`,
        { cache: force ? "no-store" : "default" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        console.error(
          "[AI Summary API]",
          eventKey,
          response.status,
          body,
        );
        throw new Error(
          (body as { error?: string }).error ??
            "Failed to load AI analysis summary",
        );
      }
      return response.json() as Promise<EventAiSummaryResponse>;
    },
    enabled: Boolean(eventKey),
    staleTime: force ? 0 : 30_000,
  });
}

export function useAnalyzeVideo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      matchKey: string;
      eventKey: string;
      teamKey?: string;
      force?: boolean;
      async?: boolean;
    }) => {
      const toastId = toast.loading(`Queuing analysis for ${params.matchKey}…`);

      try {
        const response = await fetch("/api/analyze/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchKey: params.matchKey,
            teamKey: params.teamKey,
            force: params.force ?? false,
            async: params.async ?? true,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(
            (error as { error?: string }).error ?? "Video analysis request failed",
          );
        }

        const initial = (await response.json()) as AnalyzeVideoResponse;

        if (initial.status !== "processing") {
          toast.success(
            initial.status === "cached"
              ? "Loaded cached analysis"
              : initial.status === "mock"
                ? "Analysis complete (mock fallback)"
                : "Analysis complete",
            { id: toastId },
          );
          return initial;
        }

        toast.loading("Sampling frames and running Gemini vision…", {
          id: toastId,
        });

        for (let attempt = 0; attempt < 90; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const polled = await pollAnalysisJob(params.matchKey);

          if (polled.status === "processing") {
            if (attempt === 5 || attempt === 15 || attempt === 30) {
              toast.loading(
                `Still analyzing ${params.matchKey}… (${attempt * 2}s)`,
                { id: toastId },
              );
            }
            continue;
          }

          toast.success(
            polled.status === "mock"
              ? "Analysis complete (mock fallback)"
              : "Video analysis complete",
            { id: toastId },
          );
          return polled;
        }

        throw new Error("Analysis timed out while polling job status");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Analysis failed",
          { id: toastId },
        );
        throw error;
      }
    },
    onSuccess: (result, variables) => {
      if (result.analysis) {
        queryClient.setQueryData(
          ["match-analysis", variables.eventKey, variables.matchKey],
          result.analysis,
        );
      }
      queryClient.invalidateQueries({
        queryKey: ["event-ai-summary", variables.eventKey],
      });
    },
  });
}

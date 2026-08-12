"use client";

import { useQuery } from "@tanstack/react-query";
import type { RobotMatchPoints, RobotPointAverages } from "@/lib/scoring/robot-points";

interface SoloPointsResponse {
  team: number;
  teamKey: string;
  eventKey: string;
  matchCount: number;
  averages: RobotPointAverages | null;
  matches: RobotMatchPoints[];
  error?: string;
}

export function fetchSoloPoints(team: number, eventKey: string) {
  return fetch(
    `/api/scoring/solo?team=${team}&event=${encodeURIComponent(eventKey)}`,
  ).then(async (response) => {
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      console.error("[SoloPoints] error", response.status, body);
      throw new Error(
        (body as { error?: string }).error ?? "Failed to load solo points",
      );
    }
    return response.json() as Promise<SoloPointsResponse>;
  });
}

export function useSoloPoints(team: number, eventKey: string) {
  return useQuery({
    queryKey: ["solo-points", team, eventKey],
    queryFn: () => fetchSoloPoints(team, eventKey),
    enabled: Boolean(team && eventKey),
    staleTime: 30_000,
  });
}

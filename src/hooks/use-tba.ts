"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchTbaEvent,
  fetchTbaTeam,
  fetchTbaTeamEventMatches,
  fetchTbaTeamEventStatus,
  fetchTbaTeamEvents,
} from "@/lib/api/tba-browser";
import { PUBLIC_CONFIG } from "@/lib/config/public";

export function useRuntimeConfig() {
  return useQuery({
    queryKey: ["runtime-config"],
    queryFn: async () => {
      const response = await fetch("/api/config");
      return response.json() as Promise<{
        defaultYear: number;
        defaultEvent: string;
        defaultTeam: number;
        mockMode: boolean;
        hasTbaApiKey: boolean;
        hasGeminiApiKey: boolean;
      }>;
    },
  });
}

export function useTbaTeam(teamKey = `frc${PUBLIC_CONFIG.defaultTeam}`) {
  return useQuery({
    queryKey: ["tba-team", teamKey],
    queryFn: () => fetchTbaTeam(teamKey),
    retry: false,
  });
}

export function useTbaTeamEvents(
  teamKey = `frc${PUBLIC_CONFIG.defaultTeam}`,
  year = PUBLIC_CONFIG.defaultYear,
) {
  return useQuery({
    queryKey: ["tba-team-events", teamKey, year],
    queryFn: () => fetchTbaTeamEvents(teamKey, year),
    retry: false,
  });
}

export function useTbaTeamEventMatches(
  teamKey = `frc${PUBLIC_CONFIG.defaultTeam}`,
  eventKey = PUBLIC_CONFIG.defaultEvent,
) {
  return useQuery({
    queryKey: ["tba-team-event-matches", teamKey, eventKey],
    queryFn: () => fetchTbaTeamEventMatches(teamKey, eventKey),
    retry: false,
  });
}

export function useTbaTeamEventStatus(
  teamKey = `frc${PUBLIC_CONFIG.defaultTeam}`,
  eventKey = PUBLIC_CONFIG.defaultEvent,
) {
  return useQuery({
    queryKey: ["tba-team-event-status", teamKey, eventKey],
    queryFn: () => fetchTbaTeamEventStatus(teamKey, eventKey),
    retry: false,
  });
}

export function useTbaEvent(eventKey = PUBLIC_CONFIG.defaultEvent) {
  return useQuery({
    queryKey: ["tba-event", eventKey],
    queryFn: () => fetchTbaEvent(eventKey),
    retry: false,
  });
}

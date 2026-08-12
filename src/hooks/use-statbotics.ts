"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchStatboticsEvent,
  fetchStatboticsTeam,
  fetchStatboticsTeamEvents,
} from "@/lib/api/statbotics-browser";
import { PUBLIC_CONFIG } from "@/lib/config/public";

export function useStatboticsTeam(teamNumber = PUBLIC_CONFIG.defaultTeam) {
  return useQuery({
    queryKey: ["statbotics-team", teamNumber],
    queryFn: async () => {
      const data = await fetchStatboticsTeam(teamNumber);
      if (!data || typeof data !== "object") return null;
      const record = data as Record<string, unknown>;
      if (
        record.epa == null &&
        record.win_rate == null &&
        record.norm_epa == null &&
        record.record == null
      ) {
        return null;
      }
      return data as typeof data;
    },
  });
}

export function useStatboticsTeamEvents(
  teamNumber = PUBLIC_CONFIG.defaultTeam,
  year = PUBLIC_CONFIG.defaultYear,
) {
  return useQuery({
    queryKey: ["statbotics-team-events", teamNumber, year],
    queryFn: () => fetchStatboticsTeamEvents({ team: teamNumber, year }),
  });
}

export function useStatboticsEvent(eventKey = PUBLIC_CONFIG.defaultEvent) {
  return useQuery({
    queryKey: ["statbotics-event", eventKey],
    queryFn: async () => {
      const data = await fetchStatboticsEvent(eventKey);
      return Object.keys(data).length === 0 ? null : data;
    },
  });
}

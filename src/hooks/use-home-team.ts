"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_HOME_TEAM_NUMBER,
  parseHomeTeamNumber,
  readHomeTeamNumber,
  writeHomeTeamNumber,
} from "@/lib/home-team";

function subscribeHomeTeam(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === "homeTeamNumber" || event.key === null) {
      onStoreChange();
    }
  };
  const onCustom = () => onStoreChange();

  window.addEventListener("storage", onStorage);
  window.addEventListener("home-team-changed", onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("home-team-changed", onCustom);
  };
}

function getHomeTeamSnapshot(): number {
  return readHomeTeamNumber();
}

function getServerSnapshot(): number {
  return DEFAULT_HOME_TEAM_NUMBER;
}

function subscribeHydration(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  queueMicrotask(onStoreChange);
  return () => undefined;
}

export function useHomeTeam() {
  const homeTeamNumber = useSyncExternalStore(
    subscribeHomeTeam,
    getHomeTeamSnapshot,
    getServerSnapshot,
  );
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );

  const setHomeTeamNumber = useCallback((teamNumber: number) => {
    const next = parseHomeTeamNumber(teamNumber);
    if (next == null) {
      return DEFAULT_HOME_TEAM_NUMBER;
    }
    return writeHomeTeamNumber(next);
  }, []);

  return {
    homeTeamNumber,
    homeTeamKey: `frc${homeTeamNumber}`,
    setHomeTeamNumber,
    hydrated,
    defaultHomeTeamNumber: DEFAULT_HOME_TEAM_NUMBER,
  };
}

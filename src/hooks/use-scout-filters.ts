"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PUBLIC_CONFIG } from "@/lib/config/public";

export const AVAILABLE_YEARS = [2026, 2025, 2024] as const;

export function useScoutFilters(defaults?: {
  year?: number;
  eventKey?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const defaultYear = defaults?.year ?? PUBLIC_CONFIG.defaultYear;
  const defaultEvent = defaults?.eventKey ?? PUBLIC_CONFIG.defaultEvent;

  const yearFromUrl = Number(searchParams.get("year"));
  const eventFromUrl = searchParams.get("event");

  const year =
    Number.isFinite(yearFromUrl) && yearFromUrl > 2000 ? yearFromUrl : defaultYear;
  const eventKey = eventFromUrl ?? defaultEvent;

  const syncUrl = useCallback(
    (nextYear: number, nextEvent: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("year", String(nextYear));
      params.set("event", nextEvent);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setYear = useCallback(
    (nextYear: number) => {
      const nextEvent = eventKey.startsWith(String(nextYear))
        ? eventKey
        : `${nextYear}${eventKey.replace(/^\d{4}/, "") || "cmp"}`;
      syncUrl(nextYear, nextEvent);
    },
    [eventKey, syncUrl],
  );

  const setEventKey = useCallback(
    (nextEvent: string) => {
      const inferredYear = Number(nextEvent.slice(0, 4));
      const nextYear =
        Number.isFinite(inferredYear) && inferredYear > 2000 ? inferredYear : year;
      syncUrl(nextYear, nextEvent);
    },
    [syncUrl, year],
  );

  return useMemo(
    () => ({
      year,
      eventKey,
      setYear,
      setEventKey,
    }),
    [year, eventKey, setYear, setEventKey],
  );
}

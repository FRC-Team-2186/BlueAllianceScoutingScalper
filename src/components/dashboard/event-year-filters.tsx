"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AVAILABLE_YEARS } from "@/hooks/use-scout-filters";
import { useTbaTeamEvents } from "@/hooks/use-tba";
import type { TbaEvent } from "@/lib/types/tba";
import { Skeleton } from "@/components/ui/skeleton";
import {
  filterOfficialEvents,
  isOfficialFrcEvent,
  officialEventTypeLabel,
} from "@/lib/tba/official-events";
import { useEffect, useMemo } from "react";

interface EventYearFiltersProps {
  teamKey: string;
  year: number;
  eventKey: string;
  onYearChange: (year: number) => void;
  onEventChange: (eventKey: string) => void;
}

function eventLabel(event: TbaEvent): string {
  return `${event.key} · ${event.name} (${officialEventTypeLabel(event.event_type)})`;
}

export function EventYearFilters({
  teamKey,
  year,
  eventKey,
  onYearChange,
  onEventChange,
}: EventYearFiltersProps) {
  const eventsQuery = useTbaTeamEvents(teamKey, year);
  const events = useMemo(
    () => filterOfficialEvents(eventsQuery.data ?? []),
    [eventsQuery.data],
  );

  // If the current selection is off-season/unofficial, snap to the first official event.
  useEffect(() => {
    if (eventsQuery.isLoading || eventsQuery.isError) return;
    if (events.length === 0) return;

    const selected = events.find((event) => event.key === eventKey);
    if (!selected) {
      const stillOfficial = eventsQuery.data?.find(
        (event) => event.key === eventKey && isOfficialFrcEvent(event),
      );
      if (!stillOfficial) {
        onEventChange(events[0]!.key);
      }
    }
  }, [
    events,
    eventKey,
    eventsQuery.data,
    eventsQuery.isError,
    eventsQuery.isLoading,
    onEventChange,
  ]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Year</label>
        <Select
          value={String(year)}
          onValueChange={(value) => {
            if (value != null) onYearChange(Number(value));
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AVAILABLE_YEARS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
                {option === 2025 ? " (REEFSCAPE)" : ""}
                {option === 2026 ? " (current)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-[260px] flex-1 space-y-1">
        <label className="text-xs text-muted-foreground">
          Official FRC event
        </label>
        {eventsQuery.isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : events.length > 0 ? (
          <Select
            value={events.some((event) => event.key === eventKey) ? eventKey : events[0]?.key}
            onValueChange={(value) => {
              if (value != null) onEventChange(value);
            }}
          >
            <SelectTrigger className="w-full min-w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.key} value={event.key}>
                  {eventLabel(event)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="space-y-1">
            <Input
              value={eventKey}
              onChange={(event) => onEventChange(event.target.value)}
              placeholder={`${year}cmp`}
            />
            <p className="text-xs text-muted-foreground">
              No official Regional/District/Championship events found yet for this
              team/year. Off-season events are excluded.
            </p>
          </div>
        )}
      </div>

      {eventsQuery.isError && (
        <Badge variant="outline">Using manual event key</Badge>
      )}
      {!eventsQuery.isLoading && events.length > 0 && (
        <Badge variant="secondary">{events.length} official</Badge>
      )}
    </div>
  );
}

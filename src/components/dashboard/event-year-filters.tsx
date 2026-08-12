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

interface EventYearFiltersProps {
  teamKey: string;
  year: number;
  eventKey: string;
  onYearChange: (year: number) => void;
  onEventChange: (eventKey: string) => void;
}

function eventLabel(event: TbaEvent): string {
  return `${event.key} · ${event.name}`;
}

export function EventYearFilters({
  teamKey,
  year,
  eventKey,
  onYearChange,
  onEventChange,
}: EventYearFiltersProps) {
  const eventsQuery = useTbaTeamEvents(teamKey, year);
  const events = eventsQuery.data ?? [];

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
        <label className="text-xs text-muted-foreground">Event</label>
        {eventsQuery.isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : events.length > 0 ? (
          <Select
            value={eventKey}
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
              {!events.some((event) => event.key === eventKey) && (
                <SelectItem value={eventKey}>{eventKey} (custom)</SelectItem>
              )}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={eventKey}
            onChange={(event) => onEventChange(event.target.value)}
            placeholder={`${year}cmp`}
          />
        )}
      </div>

      {eventsQuery.isError && (
        <Badge variant="outline">Using manual event key</Badge>
      )}
    </div>
  );
}

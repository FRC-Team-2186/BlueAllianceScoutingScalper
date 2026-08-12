import type { TbaEvent } from "@/lib/types/tba";

/**
 * TBA event_type codes for official FRC season events.
 * @see https://github.com/the-blue-alliance/the-blue-alliance/blob/master/consts/event_type.py
 */
export const OFFICIAL_EVENT_TYPES = {
  REGIONAL: 0,
  DISTRICT: 1,
  DISTRICT_CMP: 2,
  CMP_DIVISION: 3,
  CMP_FINALS: 4,
  DISTRICT_CMP_DIVISION: 5,
} as const;

export const OFFICIAL_EVENT_TYPE_SET = new Set<number>(
  Object.values(OFFICIAL_EVENT_TYPES),
);

export const OFFICIAL_EVENT_TYPE_LABELS: Record<number, string> = {
  [OFFICIAL_EVENT_TYPES.REGIONAL]: "Regional",
  [OFFICIAL_EVENT_TYPES.DISTRICT]: "District",
  [OFFICIAL_EVENT_TYPES.DISTRICT_CMP]: "District Championship",
  [OFFICIAL_EVENT_TYPES.CMP_DIVISION]: "Championship Division",
  [OFFICIAL_EVENT_TYPES.CMP_FINALS]: "Championship Finals",
  [OFFICIAL_EVENT_TYPES.DISTRICT_CMP_DIVISION]: "District Championship Division",
};

export function isOfficialFrcEvent(
  event: Pick<TbaEvent, "event_type" | "key">,
): boolean {
  if (!OFFICIAL_EVENT_TYPE_SET.has(event.event_type)) {
    return false;
  }
  // Guard against mis-tagged offseason keys that sometimes slip through.
  if (/off|scrimmage|practice|preseason/i.test(event.key)) {
    return false;
  }
  return true;
}

export function filterOfficialEvents<T extends Pick<TbaEvent, "event_type" | "key">>(
  events: T[],
): T[] {
  return events.filter(isOfficialFrcEvent);
}

export function officialEventTypeLabel(eventType: number): string {
  return OFFICIAL_EVENT_TYPE_LABELS[eventType] ?? `Type ${eventType}`;
}

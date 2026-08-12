export const PUBLIC_CONFIG = {
  defaultYear: Number(process.env.NEXT_PUBLIC_DEFAULT_YEAR ?? "2026"),
  defaultEvent: process.env.NEXT_PUBLIC_DEFAULT_EVENT ?? "2026cmp",
  defaultTeam: Number(process.env.NEXT_PUBLIC_DEFAULT_TEAM ?? "2186"),
} as const;

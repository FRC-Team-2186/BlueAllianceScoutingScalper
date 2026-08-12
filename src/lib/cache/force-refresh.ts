/**
 * Shared helpers for `?force=true` / `?cache=false` cache-bypass query params.
 */

export function parseForceRefreshParams(searchParams: URLSearchParams): {
  force: boolean;
  bypassCache: boolean;
} {
  const forceRaw = searchParams.get("force");
  const cacheRaw = searchParams.get("cache");

  const force =
    forceRaw === "1" ||
    forceRaw === "true" ||
    forceRaw === "yes";

  const cacheDisabled =
    cacheRaw === "0" ||
    cacheRaw === "false" ||
    cacheRaw === "no";

  return {
    force,
    bypassCache: force || cacheDisabled,
  };
}

export function withForceQuery(
  url: string,
  options?: { force?: boolean; bypassCache?: boolean },
): string {
  if (!options?.force && !options?.bypassCache) return url;
  const parsed = new URL(
    url,
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  if (options.force) {
    parsed.searchParams.set("force", "true");
  }
  if (options.bypassCache && !options.force) {
    parsed.searchParams.set("cache", "false");
  }
  return `${parsed.pathname}${parsed.search}`;
}

/** Client localStorage key for compare schema versioning. */
export const COMPARE_SCHEMA_STORAGE_KEY = "frc-scout.compare-schema-v";
export const COMPARE_SCHEMA_VERSION = "2-ai-metrics";

/** Clear client-side compare cache markers when schema version mismatches. */
export function ensureCompareClientSchemaVersion(): {
  cleared: boolean;
  previous: string | null;
} {
  if (typeof window === "undefined") {
    return { cleared: false, previous: null };
  }

  try {
    const previous = window.localStorage.getItem(COMPARE_SCHEMA_STORAGE_KEY);
    if (previous === COMPARE_SCHEMA_VERSION) {
      return { cleared: false, previous };
    }

    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (
        key.startsWith("frc-scout.") ||
        key.startsWith("compare:") ||
        key.includes("statbotics") ||
        key.includes("event-ai-summary")
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
    window.localStorage.setItem(
      COMPARE_SCHEMA_STORAGE_KEY,
      COMPARE_SCHEMA_VERSION,
    );
    return { cleared: true, previous };
  } catch {
    return { cleared: false, previous: null };
  }
}

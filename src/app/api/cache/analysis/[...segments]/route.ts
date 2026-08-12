import { NextRequest, NextResponse } from "next/server";
import {
  deleteCachedAnalysis,
  getCachedAnalysis,
  invalidateEventAnalysisCache,
  listCachedAnalyses,
  saveAnalysisCache,
} from "@/lib/cache/analysis-store";
import { loadEventTeamAiMetrics } from "@/lib/cache/event-ai-summary";
import { parseForceRefreshParams } from "@/lib/cache/force-refresh";
import { MatchAnalysisSchema } from "@/lib/types/analysis";

type RouteContext = {
  params: Promise<{ segments: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { segments } = await context.params;
  const include = request.nextUrl.searchParams.get("include");
  const { bypassCache } = parseForceRefreshParams(request.nextUrl.searchParams);

  if (segments.length === 1) {
    const eventKey = segments[0];

    if (bypassCache) {
      // Purge stale schema payloads before building the summary.
      await invalidateEventAnalysisCache(eventKey, "staleOnly");
    }

    if (include === "summary" || include === "full") {
      const summary = await loadEventTeamAiMetrics(eventKey, {
        allowStaleSchema: false,
        deleteStale: bypassCache,
      });
      if (include === "summary") {
        return NextResponse.json({
          eventKey: summary.eventKey,
          teams: summary.teams,
          analysisCount: summary.analyses.length,
          force: bypassCache,
        });
      }
      return NextResponse.json({ ...summary, force: bypassCache });
    }

    const entries = await listCachedAnalyses(eventKey, {
      allowStaleSchema: false,
      deleteStale: bypassCache,
    });
    return NextResponse.json({ eventKey, entries, force: bypassCache });
  }

  if (segments.length === 2) {
    const [eventKey, matchKey] = segments;
    const analysis = await getCachedAnalysis(eventKey, matchKey, {
      allowStaleSchema: false,
      deleteStale: bypassCache,
    });
    if (!analysis) {
      return NextResponse.json(
        {
          error: bypassCache
            ? "Analysis not found (stale cache cleared or missing)"
            : "Analysis not found in cache",
          eventKey,
          matchKey,
        },
        { status: 404 },
      );
    }
    return NextResponse.json(analysis);
  }

  return NextResponse.json(
    { error: "Use /api/cache/analysis/{eventKey} or /{eventKey}/{matchKey}" },
    { status: 400 },
  );
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { segments } = await context.params;
  if (segments.length !== 2) {
    return NextResponse.json(
      { error: "PUT requires /api/cache/analysis/{eventKey}/{matchKey}" },
      { status: 400 },
    );
  }

  const [eventKey, matchKey] = segments;
  const body = await request.json();
  const parsed = MatchAnalysisSchema.safeParse({
    ...body,
    eventKey,
    matchKey,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid analysis payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const saved = await saveAnalysisCache(parsed.data);
  return NextResponse.json(saved);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { segments } = await context.params;
  const { bypassCache } = parseForceRefreshParams(request.nextUrl.searchParams);
  const staleOnly = request.nextUrl.searchParams.get("staleOnly") !== "false";

  if (segments.length === 1) {
    const eventKey = segments[0];
    const result = await invalidateEventAnalysisCache(
      eventKey,
      bypassCache && !staleOnly ? "all" : "staleOnly",
    );
    return NextResponse.json({
      eventKey,
      deleted: result.deleted,
      kept: result.kept,
      mode: bypassCache && !staleOnly ? "all" : "staleOnly",
    });
  }

  if (segments.length === 2) {
    const [eventKey, matchKey] = segments;
    await deleteCachedAnalysis(eventKey, matchKey);
    return NextResponse.json({ eventKey, matchKey, deleted: true });
  }

  return NextResponse.json(
    { error: "DELETE requires /api/cache/analysis/{eventKey}[/matchKey]" },
    { status: 400 },
  );
}

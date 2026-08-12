import { NextRequest, NextResponse } from "next/server";
import {
  getCachedAnalysis,
  listCachedAnalyses,
  saveAnalysisCache,
} from "@/lib/cache/analysis-store";
import { loadEventTeamAiMetrics } from "@/lib/cache/event-ai-summary";
import { MatchAnalysisSchema } from "@/lib/types/analysis";

type RouteContext = {
  params: Promise<{ segments: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { segments } = await context.params;
  const include = request.nextUrl.searchParams.get("include");

  if (segments.length === 1) {
    const eventKey = segments[0];

    if (include === "summary" || include === "full") {
      const summary = await loadEventTeamAiMetrics(eventKey);
      if (include === "summary") {
        return NextResponse.json({
          eventKey: summary.eventKey,
          teams: summary.teams,
          analysisCount: summary.analyses.length,
        });
      }
      return NextResponse.json(summary);
    }

    const entries = await listCachedAnalyses(eventKey);
    return NextResponse.json({ eventKey, entries });
  }

  if (segments.length === 2) {
    const [eventKey, matchKey] = segments;
    const analysis = await getCachedAnalysis(eventKey, matchKey);
    if (!analysis) {
      return NextResponse.json(
        { error: "Analysis not found in cache", eventKey, matchKey },
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

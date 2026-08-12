import { NextRequest, NextResponse } from "next/server";
import { TbaApiError, proxyTbaRequest } from "@/lib/api/tba-client";
import { hasTbaApiKey } from "@/lib/config";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  if (!hasTbaApiKey()) {
    return NextResponse.json(
      {
        error: "TBA_API_KEY is not configured",
        mockMode: true,
        hint: "Add TBA_API_KEY to .env.local to enable live TBA data.",
      },
      { status: 503 },
    );
  }

  const { path } = await context.params;
  const tbaPath = `/${path.join("/")}`;
  const query = request.nextUrl.search;

  try {
    const data = await proxyTbaRequest(`${tbaPath}${query}`);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof TbaApiError) {
      return NextResponse.json(
        { error: error.message, path: error.path },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "Unexpected TBA proxy error" },
      { status: 500 },
    );
  }
}

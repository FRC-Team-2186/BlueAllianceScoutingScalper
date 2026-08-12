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
  const requestedUrl = `${tbaPath}${query}`;

  console.log("[TBA proxy] request", { requestedUrl });

  try {
    const data = await proxyTbaRequest(requestedUrl);
    console.log("[TBA proxy] success", {
      requestedUrl,
      itemCount: Array.isArray(data) ? data.length : undefined,
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof TbaApiError) {
      console.error("[TBA proxy] upstream error", {
        requestedUrl,
        status: error.status,
        path: error.path,
        message: error.message.slice(0, 300),
      });
      return NextResponse.json(
        { error: error.message, path: error.path, status: error.status },
        { status: error.status },
      );
    }

    console.error("[TBA proxy] unexpected error", requestedUrl, error);
    return NextResponse.json(
      { error: "Unexpected TBA proxy error", requestedUrl },
      { status: 500 },
    );
  }
}

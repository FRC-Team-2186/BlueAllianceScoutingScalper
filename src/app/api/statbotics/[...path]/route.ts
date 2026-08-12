import { NextRequest, NextResponse } from "next/server";
import {
  StatboticsApiError,
  proxyStatboticsRequest,
} from "@/lib/api/statbotics-client";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const statboticsPath = `/${path.join("/")}`;
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const requestedUrl = `${statboticsPath}${request.nextUrl.search}`;

  console.log("[Statbotics proxy] request", {
    path: statboticsPath,
    query: params,
    requestedUrl,
  });

  try {
    const data = await proxyStatboticsRequest(statboticsPath, params);
    console.log("[Statbotics proxy] success", {
      requestedUrl,
      empty:
        data == null ||
        (typeof data === "object" && Object.keys(data as object).length === 0),
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof StatboticsApiError) {
      console.error("[Statbotics proxy] upstream error", {
        requestedUrl,
        status: error.status,
        path: error.path,
        upstreamUrl: error.url,
        message: error.message.slice(0, 300),
      });
      return NextResponse.json(
        {
          error: error.message,
          path: error.path,
          status: error.status,
          upstreamUrl: error.url,
        },
        { status: error.status },
      );
    }

    console.error("[Statbotics proxy] unexpected error", requestedUrl, error);
    return NextResponse.json(
      { error: "Unexpected Statbotics proxy error", requestedUrl },
      { status: 500 },
    );
  }
}

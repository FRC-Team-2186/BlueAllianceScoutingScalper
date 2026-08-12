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

  try {
    const data = await proxyStatboticsRequest(statboticsPath, params);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof StatboticsApiError) {
      return NextResponse.json(
        { error: error.message, path: error.path },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "Unexpected Statbotics proxy error" },
      { status: 500 },
    );
  }
}

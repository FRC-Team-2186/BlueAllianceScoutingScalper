import { NextResponse } from "next/server";
import { getRuntimeConfig } from "@/lib/config";

export async function GET() {
  return NextResponse.json(getRuntimeConfig());
}

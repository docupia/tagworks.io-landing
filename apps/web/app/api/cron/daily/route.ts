import { NextResponse, type NextRequest } from "next/server";
import { getCronSecret } from "@/lib/env";
import { isAuthorizedCron, runDailyJobs } from "@/lib/scheduled-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron calls this once a day with `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), getCronSecret())) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const result = await runDailyJobs();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

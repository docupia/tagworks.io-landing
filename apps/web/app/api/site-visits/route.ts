import { NextResponse, type NextRequest } from "next/server";
import { analyticsExclusionReason } from "@/lib/analytics-events";
import { getDatabase } from "@/lib/database";
import { isSameOriginMutation } from "@/lib/request-security";
import { SITE_VISITOR_COOKIE, SITE_VISITOR_MAX_AGE, validVisitorId } from "@/lib/site-visits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (!isSameOriginMutation(request) || analyticsExclusionReason(request.headers)) return response;

  const existing = validVisitorId(request.cookies.get(SITE_VISITOR_COOKIE)?.value);
  const visitor = existing ?? crypto.randomUUID();
  try {
    await getDatabase()`select public.record_site_visit(${visitor}::uuid)`;
  } catch (error) {
    // Counting must never break the page; report and carry on.
    console.error("Could not record site visit", error);
    return response;
  }
  response.cookies.set(SITE_VISITOR_COOKIE, visitor, {
    httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax",
    path: "/", maxAge: SITE_VISITOR_MAX_AGE,
  });
  return response;
}

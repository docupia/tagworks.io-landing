import type { NextRequest } from "next/server";

export function isSameOriginMutation(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";

  return origin === request.nextUrl.origin;
}

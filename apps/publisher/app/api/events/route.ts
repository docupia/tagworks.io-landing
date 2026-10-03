import {
  ANALYTICS_EVENT_MAX_BYTES,
  parseAnalyticsEvent,
  verifyAnalyticsEventToken,
} from "../../../lib/analytics";
import { getAnalyticsEventsUrl } from "../../../lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLISHER_ORIGIN = "https://tagworks-publisher.vercel.app";

const RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "null",
  "Cache-Control": "no-store, max-age=0",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Referrer-Policy": "no-referrer",
  "Vary": "Origin",
  "X-Content-Type-Options": "nosniff",
};

function response(status: number, message?: string): Response {
  return message
    ? Response.json({ error: message }, { status, headers: RESPONSE_HEADERS })
    : new Response(null, { status, headers: RESPONSE_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  if (
    request.headers.get("origin") !== "null" ||
    request.headers.get("sec-fetch-site") !== "cross-site" ||
    !request.headers.get("content-type")?.toLowerCase().startsWith("text/plain")
  ) {
    return response(403, "허용되지 않은 요청입니다.");
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > ANALYTICS_EVENT_MAX_BYTES) {
    return response(413, "이벤트 요청이 너무 큽니다.");
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > ANALYTICS_EVENT_MAX_BYTES) {
    return response(413, "이벤트 요청이 너무 큽니다.");
  }

  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return response(400, "올바르지 않은 이벤트입니다.");
  }

  const event = parseAnalyticsEvent(input);
  if (
    !event ||
    !event.event_token ||
    !verifyAnalyticsEventToken(
      event.event_token,
      event.page_slug,
      event.page_version_id,
    )
  ) {
    return response(403, "허용되지 않은 요청입니다.");
  }

  try {
    const upstream = await fetch(getAnalyticsEventsUrl(), {
      method: "POST",
      body,
      cache: "no-store",
      headers: {
        "content-type": "text/plain;charset=UTF-8",
        origin: PUBLISHER_ORIGIN,
        referer: `${PUBLISHER_ORIGIN}/p/${event.page_slug}`,
        "sec-fetch-site": "cross-site",
        "user-agent": request.headers.get("user-agent") ?? "Tagworks publisher relay",
      },
    });
    return response(upstream.status);
  } catch {
    return response(503, "이벤트를 전달하지 못했습니다.");
  }
}

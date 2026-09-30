import {
  ANALYTICS_EVENT_MAX_BYTES,
  analyticsExclusionReason,
  parseAnalyticsEvent,
  verifyAnalyticsEventToken,
} from "../../../lib/analytics";
import { recordAnalyticsEvent } from "../../../lib/analytics-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store, max-age=0",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

class BodyTooLargeError extends Error {}

async function readBoundedBody(request: Request): Promise<string> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > ANALYTICS_EVENT_MAX_BYTES) {
        await reader.cancel();
        throw new BodyTooLargeError();
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

function errorResponse(message: string, status: number): Response {
  return Response.json(
    { error: message },
    { status, headers: RESPONSE_HEADERS },
  );
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    !contentType.startsWith("application/json") &&
    !contentType.startsWith("text/plain")
  ) {
    return errorResponse("지원하지 않는 요청 형식입니다.", 415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > ANALYTICS_EVENT_MAX_BYTES) {
    return errorResponse("이벤트 요청이 너무 큽니다.", 413);
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const isOpaqueSandboxRequest = origin === "null";
  if (
    !isOpaqueSandboxRequest &&
    ((fetchSite && fetchSite !== "same-origin") ||
      (origin && origin !== new URL(request.url).origin))
  ) {
    return errorResponse("허용되지 않은 요청입니다.", 403);
  }

  let rawBody: string;
  try {
    rawBody = await readBoundedBody(request);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return errorResponse("이벤트 요청이 너무 큽니다.", 413);
    }
    return errorResponse("이벤트 요청을 읽을 수 없습니다.", 400);
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return errorResponse("올바르지 않은 이벤트입니다.", 400);
  }

  const event = parseAnalyticsEvent(input);
  if (!event) {
    return errorResponse("올바르지 않은 이벤트입니다.", 400);
  }

  if (
    isOpaqueSandboxRequest &&
    !verifyAnalyticsEventToken(
      event.event_token,
      event.page_slug,
      event.page_version_id,
    )
  ) {
    return errorResponse("허용되지 않은 요청입니다.", 403);
  }

  event.excluded_reason = analyticsExclusionReason(request.headers) ?? event.excluded_reason;

  try {
    await recordAnalyticsEvent(event);
    return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
  } catch (error) {
    console.error("Unable to record publisher analytics event", {
      code:
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "unknown",
    });
    return errorResponse("이벤트를 저장하지 못했습니다.", 503);
  }
}

import {
  ANALYTICS_EVENT_MAX_BYTES,
  allowedPublisherRequestOrigin,
  analyticsExclusionReason,
  parseAnalyticsEvent,
  verifyAnalyticsEventToken,
} from "@/lib/analytics-events";
import { recordAnalyticsEvent } from "@/lib/analytics-database";
import { getPublisherUrl } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function responseHeaders(corsOrigin?: string): Record<string, string> {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    ...(corsOrigin
      ? {
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Origin": corsOrigin,
        }
      : {}),
  };
}

function errorResponse(message: string, status: number, corsOrigin?: string): Response {
  return Response.json(
    { error: message },
    { status, headers: responseHeaders(corsOrigin) },
  );
}

function authorizedOrigin(request: Request): string | null {
  return allowedPublisherRequestOrigin(request.headers, getPublisherUrl());
}

export async function OPTIONS(request: Request): Promise<Response> {
  const corsOrigin = authorizedOrigin(request);
  if (!corsOrigin) return errorResponse("허용되지 않은 요청입니다.", 403);
  return new Response(null, { status: 204, headers: responseHeaders(corsOrigin) });
}

export async function POST(request: Request): Promise<Response> {
  const corsOrigin = authorizedOrigin(request);
  if (!corsOrigin) {
    console.warn("Rejected analytics publisher source", {
      fetchSite: request.headers.get("sec-fetch-site"),
      origin: request.headers.get("origin"),
      referer: request.headers.get("referer"),
    });
    return errorResponse("허용되지 않은 요청입니다.", 403);
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("text/plain")) {
    return errorResponse("지원하지 않는 요청 형식입니다.", 415, corsOrigin);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > ANALYTICS_EVENT_MAX_BYTES) {
    return errorResponse("이벤트 요청이 너무 큽니다.", 413, corsOrigin);
  }

  let rawBody: string;
  try {
    rawBody = await readBoundedBody(request);
  } catch (error) {
    return errorResponse(
      error instanceof BodyTooLargeError
        ? "이벤트 요청이 너무 큽니다."
        : "이벤트 요청을 읽을 수 없습니다.",
      error instanceof BodyTooLargeError ? 413 : 400,
      corsOrigin,
    );
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return errorResponse("올바르지 않은 이벤트입니다.", 400, corsOrigin);
  }

  const event = parseAnalyticsEvent(input);
  if (
    !event ||
    !verifyAnalyticsEventToken(
      event.event_token,
      event.page_slug,
      event.page_version_id,
    )
  ) {
    console.warn("Rejected analytics event signature", {
      hasParsedEvent: Boolean(event),
    });
    return errorResponse("허용되지 않은 요청입니다.", 403, corsOrigin);
  }

  event.excluded_reason = analyticsExclusionReason(request.headers) ?? event.excluded_reason;

  try {
    await recordAnalyticsEvent(event);
    return new Response(null, { status: 204, headers: responseHeaders(corsOrigin) });
  } catch (error) {
    console.error("Unable to record analytics event", {
      code:
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "unknown",
    });
    return errorResponse("이벤트를 저장하지 못했습니다.", 503, corsOrigin);
  }
}

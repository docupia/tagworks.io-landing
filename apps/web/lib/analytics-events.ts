import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ANALYTICS_EVENT_MAX_BYTES = 4096;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SAFE_UTM_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._~:@/+ -]{0,79}$/u;

export type AnalyticsEventPayload = {
  event_token: string;
  event_id: string;
  event_type: "outbound_click" | "page_view";
  excluded_reason: "bot" | "prefetch" | null;
  link_id: string | null;
  page_slug: string;
  page_version_id: string;
  session_id: string | null;
  source_label: string;
  source_type: "direct" | "referrer" | "utm";
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_source: string | null;
};

function signingKey(): Buffer | null {
  const secret = process.env.TAGWORKS_ANALYTICS_EVENT_SECRET?.trim();
  if (!secret) return null;

  return createHash("sha256")
    .update("tagworks-analytics-event-v1\0")
    .update(secret)
    .digest();
}

export function verifyAnalyticsEventToken(
  token: string,
  pageSlug: string,
  versionId: string,
): boolean {
  const key = signingKey();
  if (!key || !SLUG_PATTERN.test(pageSlug) || !UUID_PATTERN.test(versionId)) {
    return false;
  }

  const expected = createHmac("sha256", key)
    .update(pageSlug)
    .update("\0")
    .update(versionId)
    .digest("base64url");
  const actualBytes = Buffer.from(token);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export function analyticsExclusionReason(
  headers: Pick<Headers, "get">,
): "bot" | "prefetch" | null {
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`;
  if (/prefetch|prerender/i.test(purpose)) return "prefetch";

  const userAgent = headers.get("user-agent") ?? "";
  return /(?:bot\b|crawler|spider|slurp|facebookexternalhit|preview|slackbot|twitterbot|discordbot|linkedinbot|whatsapp)/i.test(
    userAgent,
  )
    ? "bot"
    : null;
}

export function allowedPublisherRequestOrigin(
  headers: Pick<Headers, "get">,
  publisherUrl: string,
): string | null {
  let publisher: URL;
  let referer: URL;
  try {
    publisher = new URL(publisherUrl);
    referer = new URL(headers.get("referer") ?? "");
  } catch {
    return null;
  }

  if (referer.origin !== publisher.origin || !referer.pathname.startsWith("/p/")) {
    return null;
  }

  const origin = headers.get("origin");
  if (origin !== "null" && origin !== publisher.origin) return null;

  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "cross-site") return null;

  return origin;
}

export function parseAnalyticsEvent(value: unknown): AnalyticsEventPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "event_token",
    "event_id",
    "event_type",
    "excluded_reason",
    "link_id",
    "page_slug",
    "page_version_id",
    "session_id",
    "source_label",
    "source_type",
    "utm_campaign",
    "utm_medium",
    "utm_source",
  ]);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) return null;

  const eventType = record.event_type;
  const sourceType = record.source_type;
  const excludedReason = record.excluded_reason;
  const linkId = record.link_id;
  const sessionId = record.session_id;

  if (
    typeof record.event_token !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(record.event_token) ||
    typeof record.event_id !== "string" ||
    !UUID_PATTERN.test(record.event_id) ||
    typeof record.page_slug !== "string" ||
    !SLUG_PATTERN.test(record.page_slug) ||
    typeof record.page_version_id !== "string" ||
    !UUID_PATTERN.test(record.page_version_id) ||
    (eventType !== "page_view" && eventType !== "outbound_click") ||
    (sourceType !== "direct" && sourceType !== "referrer" && sourceType !== "utm") ||
    (excludedReason !== null && excludedReason !== "bot" && excludedReason !== "prefetch") ||
    (sessionId !== null && (typeof sessionId !== "string" || !UUID_PATTERN.test(sessionId))) ||
    typeof record.source_label !== "string" ||
    record.source_label.length < 1 ||
    record.source_label.length > 253 ||
    /[\u0000-\u001f\u007f]/.test(record.source_label) ||
    (eventType === "page_view" && linkId !== null) ||
    (eventType === "outbound_click" &&
      (typeof linkId !== "string" || !UUID_PATTERN.test(linkId)))
  ) {
    return null;
  }

  const optionalUtm = [record.utm_source, record.utm_medium, record.utm_campaign];
  if (
    optionalUtm.some(
      (item) => item !== null && (typeof item !== "string" || !SAFE_UTM_PATTERN.test(item)),
    )
  ) {
    return null;
  }

  const hasCampaignFields = optionalUtm.some((item) => item !== null);
  if (
    (sourceType === "direct" && (record.source_label !== "direct" || hasCampaignFields)) ||
    (sourceType === "utm" &&
      (typeof record.utm_source !== "string" || record.source_label !== record.utm_source)) ||
    (sourceType === "referrer" &&
      (hasCampaignFields || !isNormalizedHostname(record.source_label)))
  ) {
    return null;
  }

  return record as AnalyticsEventPayload;
}

function isNormalizedHostname(value: string): boolean {
  if (value !== value.toLowerCase() || /[\s/:@?#]/.test(value)) return false;
  try {
    return new URL(`https://${value}`).hostname === value;
  } catch {
    return false;
  }
}

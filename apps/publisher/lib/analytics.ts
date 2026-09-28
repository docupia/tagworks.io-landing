import { createHash } from "node:crypto";
import sanitizeHtml from "sanitize-html";

export const MAX_TRACKED_LINKS = 100;
export const ANALYTICS_EVENT_MAX_BYTES = 4096;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SAFE_UTM_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._~:@/+ -]{0,79}$/u;

export type PublishedLink = {
  destination_host: string;
  destination_url: string;
  link_id: string;
  ordinal: number;
};

export type AnalyticsSource = {
  sourceLabel: string;
  sourceType: "direct" | "referrer" | "utm";
  utmCampaign: string | null;
  utmMedium: string | null;
  utmSource: string | null;
};

export type TrackerConfig = {
  excludedReason: "bot" | "prefetch" | null;
  links: Array<{ id: string; ordinal: number }>;
  pageSlug: string;
  source: AnalyticsSource;
  versionId: string;
};

export type AnalyticsEventPayload = {
  event_id: string;
  event_type: "outbound_click" | "page_view";
  excluded_reason: "bot" | "prefetch" | null;
  link_id: string | null;
  page_slug: string;
  page_version_id: string;
  session_id: string | null;
  source_label: string;
  source_type: AnalyticsSource["sourceType"];
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_source: string | null;
};

function formatUuid(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isPageSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_PATTERN.test(value);
}

export function deterministicLinkId(
  versionId: string,
  ordinal: number,
  destinationUrl: string,
): string {
  const digest = createHash("sha256")
    .update(versionId)
    .update("\0")
    .update(String(ordinal))
    .update("\0")
    .update(destinationUrl)
    .digest()
    .subarray(0, 16);

  // RFC 9562 version 8 is reserved for application-defined UUID layouts.
  digest[6] = (digest[6] & 0x0f) | 0x80;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  return formatUuid(digest);
}

export function normalizeAbsoluteHttpsUrl(rawHref: string): URL | null {
  const href = rawHref.trim();
  if (!/^https:/i.test(href)) return null;

  try {
    const parsed = new URL(href);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.href.length > 2048 ||
      parsed.hostname.length > 253
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function extractPublishedLinks(
  sanitizedHtml: string,
  versionId: string,
): PublishedLink[] {
  const links: PublishedLink[] = [];

  sanitizeHtml(sanitizedHtml, {
    allowedAttributes: false,
    allowedTags: false,
    allowVulnerableTags: true,
    onOpenTag(tagName, attributes) {
      if (tagName !== "a" || links.length >= MAX_TRACKED_LINKS) return;
      const destination = normalizeAbsoluteHttpsUrl(attributes.href ?? "");
      if (!destination) return;

      const ordinal = links.length;
      const destinationUrl = destination.href;
      links.push({
        destination_host: destination.hostname.toLowerCase(),
        destination_url: destinationUrl,
        link_id: deterministicLinkId(versionId, ordinal, destinationUrl),
        ordinal,
      });
    },
  });

  return links;
}

function safeUtmValue(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.normalize("NFKC").trim();
  return SAFE_UTM_PATTERN.test(normalized) ? normalized : null;
}

export function classifyAnalyticsSource(
  requestUrl: string,
  referer: string | null,
): AnalyticsSource {
  const target = new URL(requestUrl);
  const utmSource = safeUtmValue(target.searchParams.get("utm_source"));
  const utmMedium = safeUtmValue(target.searchParams.get("utm_medium"));
  const utmCampaign = safeUtmValue(target.searchParams.get("utm_campaign"));

  if (utmSource) {
    return {
      sourceLabel: utmSource,
      sourceType: "utm",
      utmCampaign,
      utmMedium,
      utmSource,
    };
  }

  if (referer) {
    try {
      const source = new URL(referer);
      if (
        (source.protocol === "https:" || source.protocol === "http:") &&
        source.hostname &&
        source.origin !== target.origin
      ) {
        return {
          sourceLabel: source.hostname.toLowerCase(),
          sourceType: "referrer",
          utmCampaign: null,
          utmMedium: null,
          utmSource: null,
        };
      }
    } catch {
      // Invalid or privacy-trimmed referrers are treated as direct/unknown.
    }
  }

  return {
    sourceLabel: "direct",
    sourceType: "direct",
    utmCampaign: null,
    utmMedium: null,
    utmSource: null,
  };
}

export function analyticsExclusionReason(
  headers: Pick<Headers, "get">,
): "bot" | "prefetch" | null {
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`;
  if (/prefetch|prerender/i.test(purpose)) return "prefetch";

  const userAgent = headers.get("user-agent") ?? "";
  if (
    /(?:bot\b|crawler|spider|slurp|facebookexternalhit|preview|slackbot|twitterbot|discordbot|linkedinbot|whatsapp)/i.test(
      userAgent,
    )
  ) {
    return "bot";
  }

  return null;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => {
    const code = character.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${code}`;
  });
}

// This is the only script allowed on a published page. Uploaded scripts and
// event attributes remain stripped, and the response CSP authorizes this block
// with a fresh nonce. Keep it dependency-free and tolerant of blocked storage.
export function renderTrackerScript(config: TrackerConfig, nonce: string): string {
  return `<script nonce="${nonce}">(()=>{"use strict";
const config=${safeJson(config)};
const sessionTimeout=1800000;
const storageKey="tagworks:session:"+config.pageSlug+":"+config.versionId;
const newId=()=>crypto.randomUUID();
let session=null;
let storageAvailable=true;
try{
  const saved=JSON.parse(sessionStorage.getItem(storageKey)||"null");
  if(saved&&typeof saved.id==="string"&&typeof saved.lastActivity==="number"&&saved.source){
    session=saved;
  }
}catch{
  storageAvailable=false;
}
const touchSession=()=>{
  if(!storageAvailable)return null;
  const now=Date.now();
  if(!session||now-session.lastActivity<0||now-session.lastActivity>=sessionTimeout){
    session={id:newId(),lastActivity:now,source:config.source};
  }else{
    session.lastActivity=now;
  }
  try{
    sessionStorage.setItem(storageKey,JSON.stringify(session));
    return session;
  }catch{
    storageAvailable=false;
    session=null;
    return null;
  }
};
const trackedLinks=new WeakMap();
const anchors=[...document.querySelectorAll("a[href]")]
  .filter(anchor=>/^https:/i.test((anchor.getAttribute("href")||"").trim()))
  .slice(0,100);
for(const link of config.links){
  const anchor=anchors[link.ordinal];
  if(anchor)trackedLinks.set(anchor,link.id);
}
const send=(eventType,linkId=null)=>{
  const activeSession=touchSession();
  const source=activeSession?.source||config.source;
  let eventId;
  try{eventId=newId()}catch{return}
  const payload=JSON.stringify({
    event_id:eventId,
    page_slug:config.pageSlug,
    page_version_id:config.versionId,
    event_type:eventType,
    session_id:activeSession?.id||null,
    source_type:source.sourceType,
    source_label:source.sourceLabel,
    utm_source:source.utmSource,
    utm_medium:source.utmMedium,
    utm_campaign:source.utmCampaign,
    link_id:linkId,
    excluded_reason:config.excludedReason
  });
  const beaconBody=new Blob([payload],{type:"text/plain;charset=UTF-8"});
  const beacon=()=>{try{navigator.sendBeacon("/api/events",beaconBody)}catch{}};
  const deliver=attempt=>{
    try{
      fetch("/api/events",{
        method:"POST",
        body:payload,
        headers:{"content-type":"application/json"},
        credentials:"omit",
        keepalive:true
      }).then(response=>{
        if(response.ok)return;
        if(attempt===0)setTimeout(()=>deliver(1),250);else beacon();
      }).catch(()=>{
        if(attempt===0)setTimeout(()=>deliver(1),250);else beacon();
      });
    }catch{
      if(attempt===0)setTimeout(()=>deliver(1),250);else beacon();
    }
  };
  deliver(0);
};
send("page_view");
document.addEventListener("click",event=>{
  const target=event.target instanceof Element?event.target.closest("a[href]"):null;
  if(!target)return;
  const linkId=trackedLinks.get(target);
  if(linkId)send("outbound_click",linkId);
},true);
})();</script>`;
}

export function parseAnalyticsEvent(value: unknown): AnalyticsEventPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const allowedKeys = new Set([
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
    !isUuid(record.event_id) ||
    !isPageSlug(record.page_slug) ||
    !isUuid(record.page_version_id) ||
    (eventType !== "page_view" && eventType !== "outbound_click") ||
    (sourceType !== "direct" && sourceType !== "referrer" && sourceType !== "utm") ||
    (excludedReason !== null && excludedReason !== "bot" && excludedReason !== "prefetch") ||
    (sessionId !== null && !isUuid(sessionId)) ||
    typeof record.source_label !== "string" ||
    record.source_label.length < 1 ||
    record.source_label.length > 253 ||
    /[\u0000-\u001f\u007f]/.test(record.source_label) ||
    (eventType === "page_view" && linkId !== null) ||
    (eventType === "outbound_click" && !isUuid(linkId))
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

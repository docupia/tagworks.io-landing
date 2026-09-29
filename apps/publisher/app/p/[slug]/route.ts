import { randomBytes } from "node:crypto";

import {
  analyticsExclusionReason,
  classifyAnalyticsSource,
  extractPublishedLinks,
  isUuid,
  renderTrackerScript,
} from "../../../lib/analytics";
import { syncPublishedLinks } from "../../../lib/analytics-database";
import { renderPublishedDocument } from "../../../lib/html-document";
import { createPublicSupabaseClient } from "../../../lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store, max-age=0",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Origin-Agent-Cluster": "?1",
  "Permissions-Policy":
    "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), xr-spatial-tracking=()",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
};

function contentSecurityPolicy(nonce?: string): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "child-src 'none'",
    nonce ? "connect-src 'self'" : "connect-src 'none'",
    "font-src 'self' https: data:",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' https: data:",
    "manifest-src 'none'",
    "media-src 'self' https: data:",
    "object-src 'none'",
    nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'",
    "script-src-attr 'none'",
    "style-src 'self' https: 'unsafe-inline'",
    "worker-src 'none'",
    nonce
      ? "sandbox allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      : "sandbox allow-popups allow-popups-to-escape-sandbox",
  ].join("; ");
}

type PublishedPage = {
  description: string | null;
  sanitizer_version: string;
  sanitized_html: string;
  slug: string;
  title: string;
  updated_at: string;
  version_id: string;
};

function normalizedSlug(input: string): string | null {
  const normalized = input.normalize("NFKC").trim().toLowerCase();

  if (normalized !== input || !SLUG_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function renderDocument(page: PublishedPage, trackerScript = ""): string {
  return renderPublishedDocument({
    description: page.description,
    fallbackTitle: page.title,
    sanitizerVersion: page.sanitizer_version,
    sanitizedHtml: page.sanitized_html,
    trackerScript,
  });
}

function htmlResponse(body: string, status: number, nonce?: string): Response {
  return new Response(body, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Security-Policy": contentSecurityPolicy(nonce),
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

function unavailableResponse(status: 404 | 500): Response {
  const title = status === 404 ? "페이지를 찾을 수 없어요" : "페이지를 불러오지 못했어요";
  const message =
    status === 404
      ? "링크가 정확한지 확인하거나 페이지 소유자에게 공개 상태를 확인해 주세요."
      : "잠시 후 다시 시도해 주세요.";

  return htmlResponse(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f3e8;color:#30352a;font-family:system-ui,sans-serif}.card{width:min(34rem,calc(100% - 3rem));box-sizing:border-box;border:1px solid #d8d4c6;border-radius:1.5rem;background:#fffdf7;padding:clamp(1.75rem,5vw,3rem);box-shadow:0 1.25rem 4rem rgb(54 61 43 / 10%)}h1{margin:0 0 .8rem;font-size:clamp(1.8rem,7vw,3rem);letter-spacing:-.05em}p{margin:0;color:#707565;line-height:1.7}</style></head><body><main class="card"><h1>${title}</h1><p>${message}</p></main></body></html>`,
    status,
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug: rawSlug } = await context.params;
  const slug = normalizedSlug(rawSlug);

  if (!slug) {
    return unavailableResponse(404);
  }

  try {
    const supabase = createPublicSupabaseClient();
    const { data, error } = await supabase
      .rpc("get_published_page", { page_slug: slug })
      .maybeSingle<PublishedPage>();

    if (error) {
      console.error("Unable to load published page", {
        code: error.code,
        message: error.message,
      });
      return unavailableResponse(500);
    }

    if (!data || data.slug !== slug || typeof data.sanitized_html !== "string") {
      return unavailableResponse(404);
    }

    if (!isUuid(data.version_id)) {
      console.error("Published page is missing a valid analytics version identifier");
      return htmlResponse(renderDocument(data), 200);
    }

    try {
      const links = extractPublishedLinks(data.sanitized_html, data.version_id);
      try {
        await syncPublishedLinks(slug, data.version_id, links);
      } catch (error) {
        console.error("Unable to synchronize published page links", {
          code:
            error && typeof error === "object" && "code" in error
              ? String(error.code)
              : "unknown",
        });
      }

      const nonce = randomBytes(18).toString("base64url");
      const tracker = renderTrackerScript(
        {
          excludedReason: analyticsExclusionReason(request.headers),
          links: links.map((link) => ({ id: link.link_id, ordinal: link.ordinal })),
          pageSlug: slug,
          source: classifyAnalyticsSource(request.url, request.headers.get("referer")),
          versionId: data.version_id,
        },
        nonce,
      );

      return htmlResponse(renderDocument(data, tracker), 200, nonce);
    } catch (error) {
      // Analytics must never make a public page unavailable.
      console.error("Unable to prepare publisher analytics", {
        code:
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "unknown",
      });
      return htmlResponse(renderDocument(data), 200);
    }
  } catch (error) {
    console.error("Publisher request failed", {
      message: error instanceof Error ? error.message : "Unknown publisher error",
    });
    return unavailableResponse(500);
  }
}

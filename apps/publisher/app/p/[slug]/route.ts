import { createPublicSupabaseClient } from "../../../lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "child-src 'none'",
  "connect-src 'none'",
  "font-src data:",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src https: data:",
  "manifest-src 'none'",
  "media-src https:",
  "object-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "worker-src 'none'",
  "sandbox",
].join("; ");

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
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

type PublishedPage = {
  description: string | null;
  sanitized_html: string;
  slug: string;
  title: string;
  updated_at: string;
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function normalizedSlug(input: string): string | null {
  const normalized = input.normalize("NFKC").trim().toLowerCase();

  if (normalized !== input || !SLUG_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function renderDocument(page: PublishedPage): string {
  const title = escapeHtml(page.title);
  const description = page.description
    ? `<meta name="description" content="${escapeHtml(page.description)}">`
    : "";

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
  ${description}
  <title>${title}</title>
</head>
<body>
${page.sanitized_html}
</body>
</html>`;
}

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      ...SECURITY_HEADERS,
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
  _request: Request,
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

    return htmlResponse(renderDocument(data), 200);
  } catch (error) {
    console.error("Publisher request failed", {
      message: error instanceof Error ? error.message : "Unknown publisher error",
    });
    return unavailableResponse(500);
  }
}

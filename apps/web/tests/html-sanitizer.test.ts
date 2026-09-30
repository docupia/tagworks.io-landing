import assert from "node:assert/strict";
import test from "node:test";
import {
  deterministicLinkId,
  MAX_TRACKED_LINKS,
  prepareOriginalPublishedHtml,
  sanitizePublishedHtml,
} from "../lib/html-sanitizer";

test("removes active code and submission controls while preserving safe content", () => {
  const result = sanitizePublishedHtml(`
    <script>alert(1)</script>
    <img src=x onerror=alert(1)>
    <a href="javascript:alert(1)">bad</a>
    <form action="https://evil.example"><input name="secret"></form>
    <p onclick="alert(1)">Safe text</p>
  `);

  assert.doesNotMatch(result.html, /script|onerror|onclick|javascript:|action=|<form|<input/i);
  assert.match(result.html, /Safe text/);
  assert.match(result.html, /^<!doctype html>\s*<html/i);
  assert.ok(result.warnings.length >= 2);
});

test("keeps responsive layout CSS and safe HTTPS visual resources", () => {
  const result = sanitizePublishedHtml(`
    <style>
      .card { color: #333; padding: 2rem; background: url(https://evil.example/pixel); }
      @import url(https://evil.example/style.css);
      .overlay { position: fixed; inset: 0; }
      .responsive { background-image: image-set(url(https://cdn.example/a.webp) 1x, url(https://cdn.example/a@2x.webp) 2x); }
      @media (max-width: 600px) { .card { grid-template-columns: 1fr; } }
    </style>
    <div class="card" style="display:grid;background-image:url(https://cdn.example/x.webp)">Hello</div>
  `);

  assert.match(result.html, /color:\s*#333/);
  assert.match(result.html, /padding:\s*2rem/);
  assert.match(result.html, /url\(https:\/\/evil\.example\/pixel\)/);
  assert.match(result.html, /@import url\(https:\/\/evil\.example\/style\.css\)/);
  assert.match(result.html, /position:\s*fixed/);
  assert.match(result.html, /background-image:\s*image-set\(/);
  assert.match(result.html, /@media \(max-width:\s*600px\)/);
  assert.match(result.html, /background-image:url\(https:\/\/cdn\.example\/x\.webp\)/);
});

test("removes executable CSS while retaining style attributes and safe declarations", () => {
  const result = sanitizePublishedHtml(`
    <style id="keep" class="theme">
      body { color: #33402b; position: fixed; background: url(javascript:alert(1)); }
      .legacy { width: expression(alert(1)); }
    </style>
    <p>Still safe</p>
  `);

  assert.match(result.html, /color:\s*#33402b/);
  assert.match(result.html, /position:\s*fixed/);
  assert.match(result.html, /<style id="keep" class="theme">/i);
  assert.doesNotMatch(result.html, /javascript:|expression\s*\(/i);
});

test("preserves HTTPS and embedded raster images", () => {
  const result = sanitizePublishedHtml(`
    <img src="https://tracker.example/a.png" alt="remote">
    <img src="data:image/png;base64,AAAA" alt="embedded">
  `);

  assert.match(result.html, /https:\/\/tracker\.example\/a\.png/);
  assert.match(result.html, /data:image\/png;base64,AAAA/);
});

test("preserves the original document title, head, body attributes, and static SVG", () => {
  const result = sanitizePublishedHtml(`<!doctype html>
    <html lang="ko" class="theme-dark">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>원본 캠페인 제목</title>
        <link rel="stylesheet" href="https://cdn.example/theme.css">
        <style>:root { --brand: #596248; } body { background: var(--brand); }</style>
      </head>
      <body class="landing" style="min-height:100vh">
        <svg viewBox="0 0 20 20" aria-label="로고">
          <linearGradient id="brand"><stop offset="100%" stop-color="#596248"></stop></linearGradient>
          <path d="M0 0L20 20" fill="url(#brand)"></path>
        </svg>
      </body>
    </html>`);

  assert.match(result.html, /^<!doctype html>/i);
  assert.match(result.html, /<html lang="ko" class="theme-dark">/);
  assert.match(result.html, /<title>원본 캠페인 제목<\/title>/);
  assert.match(
    result.html,
    /<link rel="stylesheet" href="https:\/\/cdn\.example\/theme\.css" referrerpolicy="no-referrer" \/>/,
  );
  assert.match(result.html, /--brand:\s*#596248/);
  assert.match(result.html, /<body class="landing" style="min-height:100vh">/);
  assert.match(result.html, /<svg viewBox="0 0 20 20" aria-label="로고">/);
  assert.match(result.html, /<linearGradient id="brand">/);
});

test("removes auto-redirect metadata and embedded browsing contexts", () => {
  const result = sanitizePublishedHtml(`<!doctype html><html><head>
    <meta http-equiv="refresh" content="0;url=https://evil.example">
    <title>Safe title</title>
  </head><body>
    <iframe src="https://evil.example"><p>fallback</p></iframe>
    <object data="https://evil.example/file"></object>
  </body></html>`);

  assert.doesNotMatch(result.html, /http-equiv|evil\.example|<iframe|<object/i);
  assert.match(result.html, /<title>Safe title<\/title>/);
});

test("registers absolute HTTPS links without changing direct navigation", () => {
  const versionId = "018f47ba-7052-7d4f-8dc7-56e4f4e77f87";
  const result = sanitizePublishedHtml(
    `
      <a href="https://Example.com/buy?sku=1#details">Buy</a>
      <a href="mailto:hello@example.com">Mail</a>
      <a href="#inside">Inside</a>
      <a href="http://example.com/insecure">Insecure</a>
    `,
    { versionId },
  );

  assert.equal(result.outboundLinks.length, 1);
  assert.deepEqual(result.outboundLinks[0], {
    destinationHost: "example.com",
    destinationUrl: "https://example.com/buy?sku=1#details",
    id: deterministicLinkId(versionId, 0, "https://example.com/buy?sku=1#details"),
    label: "example.com",
    ordinal: 0,
  });
  assert.match(result.html, /href="https:\/\/Example\.com\/buy\?sku=1#details"/);
  assert.doesNotMatch(result.html, /target="_blank"/);
});

test("caps tracked external links while preserving every anchor", () => {
  const versionId = "018f47ba-7052-7d4f-8dc7-56e4f4e77f87";
  const anchors = Array.from(
    { length: MAX_TRACKED_LINKS + 3 },
    (_, index) => `<a href="https://example.com/${index}">Link ${index}</a>`,
  ).join("");
  const result = sanitizePublishedHtml(anchors, { versionId });

  assert.equal(result.outboundLinks.length, MAX_TRACKED_LINKS);
  assert.match(result.html, new RegExp(`https://example\\.com/${MAX_TRACKED_LINKS + 2}`));
  assert.ok(result.warnings.some((warning) => warning.includes(String(MAX_TRACKED_LINKS))));
});

test("wraps fragments as canonical documents and adds only a fallback head title", () => {
  const result = sanitizePublishedHtml(
    '<main class="hero"><svg><title>Logo label</title></svg><h1>Page</h1></main>',
    { fallbackTitle: 'Fallback <safe> & "quoted"' },
  );

  assert.match(result.html, /^<!doctype html>\n<html lang="ko">/);
  assert.match(
    result.html,
    /<head><meta charset="utf-8"><meta name="viewport"[^>]*><meta name="referrer" content="no-referrer"><title>Fallback &lt;safe&gt; &amp; &quot;quoted&quot;<\/title><\/head>/,
  );
  assert.match(result.html, /<body><main class="hero">/);
  assert.match(result.html, /<svg><title>Logo label<\/title><\/svg>/);
});

test("normalizes mixed-case HTML attributes before applying security checks", () => {
  const result = sanitizePublishedHtml(`
    <a HREF="javascript:alert(1)" TARGET="_blank">bad</a>
    <a HREF="//evil.example/path">protocol relative</a>
    <a HREF="https://safe.example/path" TARGET="_blank">safe</a>
    <img SRC="javascript:alert(1)" ONERROR="alert(1)">
    <button formAction="https://evil.example/collect">Send</button>
    <div STYLE="color:red;background:url(javascript:alert(1))">Styled</div>
  `);

  assert.doesNotMatch(result.html, /javascript:|onerror|formaction|evil\.example/i);
  assert.match(
    result.html,
    /<a href="https:\/\/safe\.example\/path" target="_blank" rel="noopener noreferrer">safe<\/a>/,
  );
  assert.match(result.html, /<div style="color:red">Styled<\/div>/);
});

test("keeps only safe metadata and stylesheet links", () => {
  const result = sanitizePublishedHtml(`<!doctype html><html><head>
    <meta name="referrer" content="unsafe-url">
    <meta http-equiv="content-security-policy" content="default-src *">
    <meta name="viewport" content="width=device-width">
    <link rel="preload" href="https://evil.example/tracker">
    <link rel="stylesheet preload" href="http://evil.example/theme.css">
    <link rel="stylesheet" href="https://cdn.example/theme.css">
    <title>Original</title>
  </head><body>Page</body></html>`);

  assert.doesNotMatch(result.html, /unsafe-url|content-security-policy|preload|http:\/\/evil/i);
  assert.equal((result.html.match(/name="referrer"/g) ?? []).length, 1);
  assert.match(result.html, /name="referrer" content="no-referrer"/);
  assert.match(result.html, /href="https:\/\/cdn\.example\/theme\.css"/);
  assert.match(result.html, /<title>Original<\/title>/);
});

test("allows only local SVG references and safe static paint values", () => {
  const result = sanitizePublishedHtml(`
    <svg viewBox="0 0 20 20">
      <defs>
        <linearGradient id="local"><stop offset="1" stop-color="#fff"></stop></linearGradient>
        <linearGradient id="remote" href="https://evil.example/gradient.svg#x"></linearGradient>
      </defs>
      <use href="#local"></use>
      <use href="https://evil.example/icons.svg#x"></use>
      <image href="https://cdn.example/photo.webp" x="0" y="0" width="20" height="20"></image>
      <image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="></image>
      <path fill="url(#local)" filter="url(https://evil.example/filter.svg#x)" d="M0 0L1 1"></path>
    </svg>
  `);

  assert.match(result.html, /<use href="#local"><\/use>/);
  assert.doesNotMatch(result.html, /evil\.example/);
  assert.match(result.html, /<image href="https:\/\/cdn\.example\/photo\.webp"/);
  assert.doesNotMatch(result.html, /image\/svg\+xml/i);
  assert.match(result.html, /<path fill="url\(#local\)" d="M0 0L1 1"><\/path>/);
});

test("publishes the decoded original document without removing scripts or external CSS", () => {
  const source = `<!doctype html>
<html><head>
  <title>Original source</title>
  <link rel="stylesheet preload" href="https://cdn.example/original.css">
  <script>window.originalInline = true;</script>
  <script src="https://cdn.example/original.js"></script>
</head><body onclick="window.clicked = true">
  <a href="https://outside.example/apply">Apply</a>
</body></html>`;
  const result = prepareOriginalPublishedHtml(source, {
    fallbackTitle: "Fallback",
    versionId: "018f47ba-7052-7d4f-8dc7-56e4f4e77f87",
  });

  assert.equal(result.html, source);
  assert.match(result.html, /<script>window\.originalInline = true;<\/script>/);
  assert.match(result.html, /href="https:\/\/cdn\.example\/original\.css"/);
  assert.match(result.html, /onclick="window\.clicked = true"/);
  assert.equal(result.outboundLinks.length, 1);
  assert.ok(result.warnings.some((warning) => warning.includes("격리된 공개 환경")));
});

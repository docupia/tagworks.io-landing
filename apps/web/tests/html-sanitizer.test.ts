import assert from "node:assert/strict";
import test from "node:test";
import {
  deterministicLinkId,
  MAX_TRACKED_LINKS,
  sanitizePublishedHtml,
} from "../lib/html-sanitizer";

test("removes scripts, event handlers, forms, and dangerous URLs", () => {
  const result = sanitizePublishedHtml(`
    <script>alert(1)</script>
    <img src=x onerror=alert(1)>
    <a href="javascript:alert(1)">bad</a>
    <form action="https://evil.example"><input name="secret"></form>
    <p onclick="alert(1)">Safe text</p>
  `);

  assert.doesNotMatch(result.html, /script|onerror|onclick|javascript:|<form|<input/i);
  assert.match(result.html, /Safe text/);
  assert.ok(result.warnings.length >= 2);
});

test("keeps layout CSS but removes network and active CSS", () => {
  const result = sanitizePublishedHtml(`
    <style>
      .card { color: #333; padding: 2rem; background: url(https://evil.example/pixel); }
      @import url(https://evil.example/style.css);
      .overlay { position: fixed; inset: 0; }
    </style>
    <div class="card" style="display:grid;background-image:url(https://evil.example/x)">Hello</div>
  `);

  assert.match(result.html, /color:\s*#333/);
  assert.match(result.html, /padding:\s*2rem/);
  assert.doesNotMatch(result.html, /url\s*\(|@import|position:\s*fixed|background-image/i);
});

test("sanitizes style blocks even when the source includes attributes", () => {
  const result = sanitizePublishedHtml(`
    <style id="keep" class="theme">
      @import url(https://evil.example/style.css);
      body { color: #33402b; position: fixed; background: url(https://evil.example/pixel); }
    </style>
    <p>Still safe</p>
  `);

  assert.match(result.html, /color:\s*#33402b/);
  assert.doesNotMatch(result.html, /@import|position:\s*fixed|url\s*\(|evil\.example/i);
  assert.doesNotMatch(result.html, /<style[^>]+>/i);
});

test("allows only embedded data images", () => {
  const result = sanitizePublishedHtml(`
    <img src="https://tracker.example/a.png" alt="remote">
    <img src="data:image/png;base64,AAAA" alt="embedded">
  `);

  assert.doesNotMatch(result.html, /tracker\.example/);
  assert.match(result.html, /data:image\/png;base64,AAAA/);
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
  assert.match(result.html, /target="_blank"/);
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

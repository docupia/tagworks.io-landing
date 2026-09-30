import assert from "node:assert/strict";
import test from "node:test";

import {
  isIsolatedOriginalDocument,
  renderPublishedDocument,
} from "../lib/html-document";

const TRACKER = '<script nonce="test">tracker()</script>';

test("detects executable originals when an older public RPC omits the version", () => {
  assert.equal(
    isIsolatedOriginalDocument(undefined, "<html><script>run()</script></html>"),
    true,
  );
  assert.equal(
    isIsolatedOriginalDocument(undefined, '<body onload="run()">Page</body>'),
    true,
  );
  assert.equal(
    isIsolatedOriginalDocument(undefined, "<main>Legacy safe fragment</main>"),
    false,
  );
  assert.equal(
    isIsolatedOriginalDocument(
      "tagworks-html-v3-fidelity",
      "<script>should-not-be-present()</script>",
    ),
    false,
  );
});

test("preserves a complete source document and its title byte-for-byte around tracker insertion", () => {
  const source = `<!DOCTYPE html>
<html lang="en" data-theme="paper">
<head>
  <meta charset="utf-8">
  <title>Source document title</title>
  <style>.card::after{content:"</body>"}</style>
</head>
<body class="source-body"><main>Original layout</main></body>
</html>`;

  const rendered = renderPublishedDocument({
    description: "Database description",
    fallbackTitle: "Database title",
    sanitizedHtml: source,
    trackerScript: TRACKER,
  });

  assert.equal(
    rendered,
    source.replace(
      '<body class="source-body"><main>Original layout</main></body>',
      `<body class="source-body"><main>Original layout</main>${TRACKER}</body>`,
    ),
  );
  assert.equal((rendered.match(/<!DOCTYPE html>/g) ?? []).length, 1);
  assert.equal((rendered.match(/<html\b/gi) ?? []).length, 1);
  assert.match(rendered, /<title>Source document title<\/title>/);
  assert.doesNotMatch(rendered, /Database title|Database description/);
});

test("adds only an escaped fallback title when a full document has no title", () => {
  const source = '<html data-layout="custom"><head><meta charset="utf-8"></head><main>Page</main></html>';
  const rendered = renderPublishedDocument({
    description: null,
    fallbackTitle: 'Fallback <title> & "safe"',
    sanitizedHtml: source,
    trackerScript: TRACKER,
  });

  assert.equal(
    rendered,
    '<html data-layout="custom"><head><meta charset="utf-8"><title>Fallback &lt;title&gt; &amp; &quot;safe&quot;</title></head><main>Page</main>' +
      `${TRACKER}</html>`,
  );
});

test("does not use an SVG or body title as the browser tab title", () => {
  const source =
    '<html><head><meta charset="utf-8"></head><body><svg><title>Logo label</title></svg><title>Body label</title></body></html>';
  const rendered = renderPublishedDocument({
    description: null,
    fallbackTitle: "Browser tab fallback",
    sanitizedHtml: source,
  });

  assert.equal(
    rendered,
    '<html><head><meta charset="utf-8"><title>Browser tab fallback</title></head><body><svg><title>Logo label</title></svg><title>Body label</title></body></html>',
  );
});

test("uses the v3 sanitizer contract even when a stored document lacks html and doctype tags", () => {
  const source = "<head><title>Versioned document</title></head><body>Page</body>";
  const rendered = renderPublishedDocument({
    description: null,
    fallbackTitle: "Fallback",
    sanitizerVersion: "tagworks-html-v3-fidelity",
    sanitizedHtml: source,
    trackerScript: TRACKER,
  });

  assert.equal(
    rendered,
    `<head><title>Versioned document</title></head><body>Page${TRACKER}</body>`,
  );
});

test("keeps v4 original scripts and stylesheet markup around tracker insertion", () => {
  const source =
    '<!doctype html><html><head><title>Original</title><link rel="stylesheet preload" href="https://cdn.example/site.css"><script>window.inline=true</script><script src="https://cdn.example/site.js"></script></head><body onload="window.ready=true">Page</body></html>';
  const rendered = renderPublishedDocument({
    description: null,
    fallbackTitle: "Fallback",
    sanitizerVersion: "tagworks-html-v4-isolated-original",
    sanitizedHtml: source,
    trackerScript: TRACKER,
  });

  assert.equal(rendered, source.replace("</body>", `${TRACKER}</body>`));
  assert.match(rendered, /<script>window\.inline=true<\/script>/);
  assert.match(rendered, /href="https:\/\/cdn\.example\/site\.css"/);
  assert.match(rendered, /onload="window\.ready=true"/);
});

test("keeps parsed-document detection as a fallback for unversioned full documents", () => {
  const source = "<!doctype html><html><head><title>Existing</title></head><body>Page</body></html>";
  const rendered = renderPublishedDocument({
    description: null,
    fallbackTitle: "Fallback",
    sanitizerVersion: "tagworks-html-v2",
    sanitizedHtml: source,
    trackerScript: TRACKER,
  });

  assert.equal(
    rendered,
    `<!doctype html><html><head><title>Existing</title></head><body>Page${TRACKER}</body></html>`,
  );
});

test("supports doctype-led documents without adding a second html wrapper", () => {
  const source = "<!doctype html><body><h1>Standalone body</h1></body>";
  const rendered = renderPublishedDocument({
    description: null,
    fallbackTitle: "Fallback",
    sanitizedHtml: source,
    trackerScript: TRACKER,
  });

  assert.equal(
    rendered,
    `<!doctype html><head><title>Fallback</title></head><body><h1>Standalone body</h1>${TRACKER}</body>`,
  );
  assert.equal((rendered.match(/<!doctype html>/gi) ?? []).length, 1);
  assert.doesNotMatch(rendered, /<html lang=/i);
});

test("keeps the legacy fragment wrapper for previously stored fragments", () => {
  const fragment = '<main class="legacy"><h1>Legacy fragment</h1></main>';
  const rendered = renderPublishedDocument({
    description: "Legacy description",
    fallbackTitle: "Legacy title",
    sanitizedHtml: fragment,
    trackerScript: TRACKER,
  });

  assert.match(rendered, /^<!doctype html>\n<html lang="ko">/);
  assert.match(rendered, /<title>Legacy title<\/title>/);
  assert.match(rendered, /<meta name="description" content="Legacy description">/);
  assert.ok(rendered.includes(fragment));
  assert.ok(rendered.includes(`${TRACKER}\n</body>`));
});

test("does not rewrite complete documents when no fallback or tracker is needed", () => {
  const source = "<HTML><HEAD><TITLE>Kept</TITLE></HEAD><BODY>Exact bytes</BODY></HTML>";
  const rendered = renderPublishedDocument({
    description: "Ignored",
    fallbackTitle: "Ignored",
    sanitizedHtml: source,
  });

  assert.equal(rendered, source);
});

test("does not mistake html-looking CSS text for a complete document", () => {
  const fragment = '<style>.label::after{content:"<html>"}</style><p>Fragment</p>';
  const rendered = renderPublishedDocument({
    description: null,
    fallbackTitle: "Fragment title",
    sanitizedHtml: fragment,
  });

  assert.match(rendered, /^<!doctype html>/);
  assert.ok(rendered.includes(fragment));
});

import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/events/route";

test("rejects malformed analytics events before touching the collector database", async () => {
  const response = await POST(
    new Request("https://pages.example/api/events", {
      body: "{}",
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
});

test("rejects cross-origin and oversized event requests", async () => {
  const crossOrigin = await POST(
    new Request("https://pages.example/api/events", {
      body: "{}",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      method: "POST",
    }),
  );
  assert.equal(crossOrigin.status, 403);

  const opaqueOriginWithInvalidToken = await POST(
    new Request("https://pages.example/api/events", {
      body: JSON.stringify({
        event_token: "a".repeat(43),
        event_id: "2a6d9e68-d1bf-4f3f-9714-4d01382a3dca",
        event_type: "page_view",
        excluded_reason: null,
        link_id: null,
        page_slug: "page-abc123",
        page_version_id: "8acdf989-6c7c-47ba-a577-127483efdc03",
        session_id: "65916e09-50a4-46e9-8520-0b78f2a65a18",
        source_label: "direct",
        source_type: "direct",
        utm_campaign: null,
        utm_medium: null,
        utm_source: null,
      }),
      headers: {
        "content-type": "text/plain;charset=UTF-8",
        origin: "null",
        "sec-fetch-site": "cross-site",
      },
      method: "POST",
    }),
  );
  assert.equal(opaqueOriginWithInvalidToken.status, 403);

  const oversized = await POST(
    new Request("https://pages.example/api/events", {
      body: "{}",
      headers: {
        "content-length": "5000",
        "content-type": "text/plain;charset=UTF-8",
      },
      method: "POST",
    }),
  );
  assert.equal(oversized.status, 413);
});

import assert from "node:assert/strict";
import test from "node:test";

const VERSION_ID = "8acdf989-6c7c-47ba-a577-127483efdc03";

test("publisher relay rejects non-sandbox requests before forwarding", async () => {
  const { POST } = await import("../app/api/events/route");
  const result = await POST(
    new Request("https://tagworks-publisher.vercel.app/api/events", {
      method: "POST",
      body: "{}",
      headers: {
        "content-type": "text/plain",
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
    }),
  );

  assert.equal(result.status, 403);
});

test("publisher relay rejects invalid event signatures", async () => {
  const previousSecret = process.env.TAGWORKS_ANALYTICS_EVENT_SECRET;
  process.env.TAGWORKS_ANALYTICS_EVENT_SECRET = "test-only-event-secret";

  try {
    const { POST } = await import("../app/api/events/route");
    const result = await POST(
      new Request("https://tagworks-publisher.vercel.app/api/events", {
        method: "POST",
        body: JSON.stringify({
          event_token: "a".repeat(43),
          event_id: "2a6d9e68-d1bf-4f3f-9714-4d01382a3dca",
          event_type: "page_view",
          excluded_reason: null,
          link_id: null,
          page_slug: "page-abc123",
          page_version_id: VERSION_ID,
          session_id: "65916e09-50a4-46e9-8520-0b78f2a65a18",
          source_label: "direct",
          source_type: "direct",
          utm_campaign: null,
          utm_medium: null,
          utm_source: null,
        }),
        headers: {
          "content-type": "text/plain",
          origin: "null",
          "sec-fetch-site": "cross-site",
        },
      }),
    );

    assert.equal(result.status, 403);
    assert.equal(result.headers.get("access-control-allow-origin"), "null");
  } finally {
    if (previousSecret === undefined) {
      delete process.env.TAGWORKS_ANALYTICS_EVENT_SECRET;
    } else {
      process.env.TAGWORKS_ANALYTICS_EVENT_SECRET = previousSecret;
    }
  }
});

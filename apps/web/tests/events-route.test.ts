import assert from "node:assert/strict";
import test from "node:test";

import { POST, OPTIONS } from "../app/api/events/route";
import {
  allowedPublisherRequestOrigin,
  parseAnalyticsEvent,
  verifyAnalyticsEventToken,
} from "../lib/analytics-events";
import { createAnalyticsEventToken } from "../../publisher/lib/analytics";

const PUBLISHER_URL = "https://tagworks-publisher.vercel.app";
const VERSION_ID = "8acdf989-6c7c-47ba-a577-127483efdc03";

const publisherHeaders = {
  "content-type": "text/plain;charset=UTF-8",
  origin: "null",
  referer: `${PUBLISHER_URL}/p/page-abc123`,
  "sec-fetch-site": "cross-site",
};

test("accepts only requests referred by a published page", () => {
  assert.equal(
    allowedPublisherRequestOrigin(new Headers(publisherHeaders), PUBLISHER_URL),
    "null",
  );
  assert.equal(
    allowedPublisherRequestOrigin(
      new Headers({ ...publisherHeaders, referer: "https://evil.example/p/page-abc123" }),
      PUBLISHER_URL,
    ),
    null,
  );
  assert.equal(
    allowedPublisherRequestOrigin(
      new Headers({ ...publisherHeaders, referer: `${PUBLISHER_URL}/dashboard` }),
      PUBLISHER_URL,
    ),
    null,
  );
  assert.equal(
    allowedPublisherRequestOrigin(
      new Headers({ ...publisherHeaders, origin: "https://evil.example" }),
      PUBLISHER_URL,
    ),
    null,
  );
});

test("publisher and operations API share the same event signature contract", () => {
  const previousSecret = process.env.TAGWORKS_ANALYTICS_EVENT_SECRET;
  process.env.TAGWORKS_ANALYTICS_EVENT_SECRET = "test-only-event-secret";

  try {
    const token = createAnalyticsEventToken("page-abc123", VERSION_ID);
    assert.ok(token);
    assert.equal(
      verifyAnalyticsEventToken(token, "page-abc123", VERSION_ID),
      true,
    );
  } finally {
    if (previousSecret === undefined) {
      delete process.env.TAGWORKS_ANALYTICS_EVENT_SECRET;
    } else {
      process.env.TAGWORKS_ANALYTICS_EVENT_SECRET = previousSecret;
    }
  }
});

test("validates the operations analytics event contract", () => {
  const event = {
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
  } as const;

  assert.deepEqual(parseAnalyticsEvent(event), event);
  assert.equal(parseAnalyticsEvent({ ...event, extra: true }), null);
  assert.equal(parseAnalyticsEvent({ ...event, event_token: null }), null);
});

test("operations endpoint rejects missing referrers and invalid signatures", async () => {
  const previousPublisherUrl = process.env.NEXT_PUBLIC_PUBLISHER_URL;
  const previousSecret = process.env.TAGWORKS_ANALYTICS_EVENT_SECRET;
  process.env.NEXT_PUBLIC_PUBLISHER_URL = PUBLISHER_URL;
  process.env.TAGWORKS_ANALYTICS_EVENT_SECRET = "test-only-event-secret";

  try {
    const missingReferer = await POST(
      new Request("https://tagworks.io/api/events", {
        body: "{}",
        headers: { "content-type": "text/plain", origin: "null" },
        method: "POST",
      }),
    );
    assert.equal(missingReferer.status, 403);

    const invalidSignature = await POST(
      new Request("https://tagworks.io/api/events", {
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
        headers: publisherHeaders,
        method: "POST",
      }),
    );
    assert.equal(invalidSignature.status, 403);
    assert.equal(invalidSignature.headers.get("access-control-allow-origin"), "null");

    const preflight = await OPTIONS(
      new Request("https://tagworks.io/api/events", {
        headers: publisherHeaders,
        method: "OPTIONS",
      }),
    );
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "null");
  } finally {
    if (previousPublisherUrl === undefined) {
      delete process.env.NEXT_PUBLIC_PUBLISHER_URL;
    } else {
      process.env.NEXT_PUBLIC_PUBLISHER_URL = previousPublisherUrl;
    }
    if (previousSecret === undefined) {
      delete process.env.TAGWORKS_ANALYTICS_EVENT_SECRET;
    } else {
      process.env.TAGWORKS_ANALYTICS_EVENT_SECRET = previousSecret;
    }
  }
});

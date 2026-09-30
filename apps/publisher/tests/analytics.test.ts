import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import {
  MAX_TRACKED_LINKS,
  analyticsExclusionReason,
  classifyAnalyticsSource,
  createAnalyticsEventToken,
  deterministicLinkId,
  extractPublishedLinks,
  isUuid,
  parseAnalyticsEvent,
  renderTrackerScript,
  verifyAnalyticsEventToken,
} from "../lib/analytics";

const VERSION_ID = "8acdf989-6c7c-47ba-a577-127483efdc03";

test("signs opaque-sandbox analytics tokens for one page version", () => {
  const previousSecret = process.env.TAGWORKS_ANALYTICS_EVENT_SECRET;
  process.env.TAGWORKS_ANALYTICS_EVENT_SECRET = "test-only-event-secret";

  try {
    const token = createAnalyticsEventToken("page-abc123", VERSION_ID);
    assert.match(token ?? "", /^[A-Za-z0-9_-]{43}$/);
    assert.equal(
      verifyAnalyticsEventToken(token, "page-abc123", VERSION_ID),
      true,
    );
    assert.equal(
      verifyAnalyticsEventToken(token, "page-different", VERSION_ID),
      false,
    );
  } finally {
    if (previousSecret === undefined) {
      delete process.env.TAGWORKS_ANALYTICS_EVENT_SECRET;
    } else {
      process.env.TAGWORKS_ANALYTICS_EVENT_SECRET = previousSecret;
    }
  }
});

test("extracts only absolute HTTPS anchors and creates stable per-position UUIDs", () => {
  const links = extractPublishedLinks(
    `
      <a href="https://Example.COM:443/classes/../apply?q=1#form">신청</a>
      <a href="/relative">내부</a>
      <a href="mailto:hello@example.com">메일</a>
      <a href="http://example.com/insecure">HTTP</a>
      <a href="https://example.com/apply?q=1#form">다시 신청</a>
    `,
    VERSION_ID,
  );

  assert.equal(links.length, 2);
  assert.deepEqual(
    links.map(({ destination_host, destination_url, ordinal }) => ({
      destination_host,
      destination_url,
      ordinal,
    })),
    [
      {
        destination_host: "example.com",
        destination_url: "https://example.com/apply?q=1#form",
        ordinal: 0,
      },
      {
        destination_host: "example.com",
        destination_url: "https://example.com/apply?q=1#form",
        ordinal: 1,
      },
    ],
  );
  assert.ok(links.every((link) => isUuid(link.link_id)));
  assert.notEqual(links[0].link_id, links[1].link_id);
  assert.equal(
    links[0].link_id,
    deterministicLinkId(VERSION_ID, 0, "https://example.com/apply?q=1#form"),
  );
  assert.equal(links[0].link_id[14], "8");
  assert.match(links[0].link_id[19], /[89ab]/);
});

test("caps tracked links without changing the published HTML", () => {
  const html = Array.from(
    { length: MAX_TRACKED_LINKS + 5 },
    (_, index) => `<a href="https://example.com/${index}">${index}</a>`,
  ).join("");

  const links = extractPublishedLinks(html, VERSION_ID);
  assert.equal(links.length, MAX_TRACKED_LINKS);
  assert.equal(links.at(-1)?.destination_url, "https://example.com/99");

  const oversized = `https://example.com/${"a".repeat(2040)}`;
  assert.equal(
    extractPublishedLinks(`<a href="${oversized}">too long</a>`, VERSION_ID).length,
    0,
  );
});

test("classifies UTM first and never keeps a full referrer URL", () => {
  const utm = classifyAnalyticsSource(
    "https://pages.example/p/demo?utm_source=%EC%9D%B8%EC%8A%A4%ED%83%80&utm_medium=social&utm_campaign=spring-2026",
    "https://blog.example/private/path?token=secret",
  );
  assert.deepEqual(utm, {
    sourceLabel: "인스타",
    sourceType: "utm",
    utmCampaign: "spring-2026",
    utmMedium: "social",
    utmSource: "인스타",
  });

  const referrer = classifyAnalyticsSource(
    "https://pages.example/p/demo",
    "https://blog.example/private/path?token=secret",
  );
  assert.equal(referrer.sourceType, "referrer");
  assert.equal(referrer.sourceLabel, "blog.example");
  assert.doesNotMatch(JSON.stringify(referrer), /private|token|secret/);

  assert.equal(
    classifyAnalyticsSource(
      "https://pages.example/p/demo",
      "https://pages.example/another-path?secret=yes",
    ).sourceType,
    "direct",
  );
});

test("marks bot and prefetch requests without retaining user agent data", () => {
  assert.equal(
    analyticsExclusionReason(new Headers({ purpose: "prefetch" })),
    "prefetch",
  );
  assert.equal(
    analyticsExclusionReason(new Headers({ "user-agent": "Slackbot-LinkExpanding 1.0" })),
    "bot",
  );
  assert.equal(
    analyticsExclusionReason(new Headers({ "user-agent": "Mozilla/5.0 Safari/605.1.15" })),
    null,
  );
});

test("validates the bounded public event contract", () => {
  const event = {
    event_token: null,
    event_id: "2a6d9e68-d1bf-4f3f-9714-4d01382a3dca",
    event_type: "outbound_click",
    excluded_reason: null,
    link_id: "632d90ab-1230-8d18-92dc-829ef1328ee4",
    page_slug: "page-abc123",
    page_version_id: VERSION_ID,
    session_id: "65916e09-50a4-46e9-8520-0b78f2a65a18",
    source_label: "blog.example",
    source_type: "referrer",
    utm_campaign: null,
    utm_medium: null,
    utm_source: null,
  } as const;

  assert.deepEqual(parseAnalyticsEvent(event), event);
  assert.equal(parseAnalyticsEvent({ ...event, destination_url: "https://evil.example" }), null);
  assert.equal(parseAnalyticsEvent({ ...event, event_type: "page_view" }), null);
  assert.equal(parseAnalyticsEvent({ ...event, source_label: "bad\nvalue" }), null);
  assert.equal(
    parseAnalyticsEvent({
      ...event,
      source_label: "blog.example/private?token=secret",
    }),
    null,
  );
  assert.equal(
    parseAnalyticsEvent({
      ...event,
      source_label: "direct",
      source_type: "direct",
      utm_campaign: "forged-campaign",
    }),
    null,
  );
});

test("serializes tracker configuration without ending the platform script", () => {
  const script = renderTrackerScript(
    {
      eventEndpoint: "https://pages.example/api/events",
      eventToken: null,
      excludedReason: null,
      links: [],
      opaqueOrigin: false,
      pageSlug: "page-abc123",
      source: {
        sourceLabel: "</script><script>alert(1)</script>",
        sourceType: "referrer",
        utmCampaign: null,
        utmMedium: null,
        utmSource: null,
      },
      versionId: VERSION_ID,
    },
    "test-nonce",
  );

  assert.match(script, /^<script nonce="test-nonce">/);
  assert.equal((script.match(/<script/g) ?? []).length, 1);
  assert.doesNotMatch(script, /<script>alert/);
  assert.ok(script.includes("\\u003c/script\\u003e"));
  assert.match(script, /sessionStorage/);
  assert.match(script, /\/api\/events/);
  assert.ok(script.includes("https://pages.example/api/events"));
  assert.doesNotMatch(script, /fetch\("\/api\/events"/);
});

test("rotates a tab session when an event occurs after 30 minutes of inactivity", async () => {
  let now = 1_000;
  let uuidCounter = 0;
  const beacons: Blob[] = [];
  const requests: string[] = [];
  const listeners = new Map<string, (event: { target: unknown }) => void>();
  const storage = new Map<string, string>();

  class FakeElement {
    getAttribute(name: string) {
      return name === "href" ? "https://outside.example/apply" : null;
    }

    closest() {
      return this;
    }
  }

  const anchor = new FakeElement();
  const script = renderTrackerScript(
    {
      eventEndpoint: "https://pages.example/api/events",
      eventToken: "signed-event-token",
      excludedReason: null,
      links: [{ id: "632d90ab-1230-8d18-92dc-829ef1328ee4", ordinal: 0 }],
      opaqueOrigin: false,
      pageSlug: "page-abc123",
      source: {
        sourceLabel: "blog.example",
        sourceType: "referrer",
        utmCampaign: null,
        utmMedium: null,
        utmSource: null,
      },
      versionId: VERSION_ID,
    },
    "test-nonce",
  );
  const javascript = script.slice(script.indexOf(">") + 1, -"</script>".length);

  vm.runInNewContext(javascript, {
    Blob,
    Date: { now: () => now },
    Element: FakeElement,
    console,
    crypto: {
      randomUUID() {
        uuidCounter += 1;
        return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, "0")}`;
      },
    },
    document: {
      addEventListener(name: string, listener: (event: { target: unknown }) => void) {
        listeners.set(name, listener);
      },
      querySelectorAll() {
        return [anchor];
      },
    },
    fetch: async (_url: string, init: { body: string }) => {
      requests.push(init.body);
      return new Response(null, { status: 204 });
    },
    navigator: {
      sendBeacon(_url: string, body: Blob) {
        beacons.push(body);
        return true;
      },
    },
    sessionStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    },
    setTimeout,
  });

  assert.equal(requests.length, 1);
  assert.equal(beacons.length, 0);
  const pageView = JSON.parse(requests[0]) as { session_id: string };

  now += 30 * 60 * 1000;
  listeners.get("click")?.({ target: anchor });

  assert.equal(requests.length, 2);
  const click = JSON.parse(requests[1]) as {
    event_type: string;
    session_id: string;
    source_label: string;
  };
  assert.equal(click.event_type, "outbound_click");
  assert.notEqual(click.session_id, pageView.session_id);
  assert.equal(click.source_label, "blog.example");
});

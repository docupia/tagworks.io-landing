import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAnalyticsRange,
  parsePageAnalytics,
  safeOutboundUrl,
} from "../lib/analytics";

test("allows only supported analytics ranges", () => {
  assert.equal(parseAnalyticsRange("7"), 7);
  assert.equal(parseAnalyticsRange(["90", "7"]), 90);
  assert.equal(parseAnalyticsRange("365"), 30);
  assert.equal(parseAnalyticsRange(undefined), 30);
});

test("normalizes the analytics RPC payload for rendering", () => {
  const analytics = parsePageAnalytics(
    {
      updatedAt: "2026-09-28T10:00:00Z",
      rangeDays: 7,
      summary: {
        pageViews: "12",
        sessions: 10,
        clickSessions: 4,
        clickRate: 140,
        totalClicks: -3,
        tagworksSessions: 2,
      },
      sources: [{ key: "utm:blog", type: "utm", label: "블로그", sessions: 10 }],
      flows: [],
      links: [],
      daily: [{ date: "2026-09-28", sessions: 10, clickSessions: 4 }],
    },
    30,
  );

  assert.ok(analytics);
  assert.equal(analytics.rangeDays, 7);
  assert.equal(analytics.summary.pageViews, 12);
  assert.equal(analytics.summary.clickRate, 100);
  assert.equal(analytics.summary.totalClicks, 0);
  assert.equal(analytics.sources[0]?.clickSessions, 0);
});

test("rejects malformed analytics payloads and unsafe outbound URLs", () => {
  assert.equal(parsePageAnalytics([], 30), null);
  assert.equal(parsePageAnalytics({ summary: null }, 30), null);
  assert.equal(safeOutboundUrl("javascript:alert(1)"), null);
  assert.equal(safeOutboundUrl("http://example.com"), null);
  assert.equal(safeOutboundUrl("https://example.com/path"), "https://example.com/path");
});

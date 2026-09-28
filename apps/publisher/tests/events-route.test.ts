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

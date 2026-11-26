import assert from "node:assert/strict";
import test from "node:test";
import { canViewSiteVisits, isCountedSitePath, validVisitorId } from "../lib/site-visits";

test("only public site paths are counted", () => {
  for (const path of ["/", "/pricing", "/affiliates", "/login", "/signup"]) assert.equal(isCountedSitePath(path), true, path);
  for (const path of ["/dashboard", "/dashboard/profile", "/pages/new", "/billing", "/api/site-visits", "/auth/callback"]) assert.equal(isCountedSitePath(path), false, path);
  assert.equal(isCountedSitePath("/pagesx"), true);
});

test("visitor ids must be UUIDs", () => {
  assert.equal(validVisitorId("8F14E45F-CEEA-467A-9A36-DEDD4BEA2543"), "8f14e45f-ceea-467a-9a36-dedd4bea2543");
  assert.equal(validVisitorId("nope"), null);
  assert.equal(validVisitorId(undefined), null);
});

test("only the confirmed owner account can view visitor counts", () => {
  assert.equal(canViewSiteVisits({ email: "Docupia@gmail.com", email_confirmed_at: "2026-01-01" }), true);
  assert.equal(canViewSiteVisits({ email: "docupia@gmail.com", email_confirmed_at: undefined }), false);
  assert.equal(canViewSiteVisits({ email: "other@example.com", email_confirmed_at: "2026-01-01" }), false);
  assert.equal(canViewSiteVisits(null), false);
});

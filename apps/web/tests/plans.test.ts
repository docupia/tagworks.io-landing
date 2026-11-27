import assert from "node:assert/strict";
import test from "node:test";
import { accountPlanFromRow } from "../lib/account-plan";
import { ADMIN_MAX_LINKS, fill, formatBytes, parsePlanOverrides, PLANS, resolveLimits } from "../lib/plans";

test("public plans match the pricing spec", () => {
  assert.equal(PLANS.free.maxLinks, 1);
  assert.equal(PLANS.starter.maxLinks, 5);
  assert.equal(PLANS.pro.maxLinks, 30);
  assert.deepEqual([PLANS.free.priceUsd, PLANS.starter.priceUsd, PLANS.pro.priceUsd], [0, 5, 15]);
  assert.deepEqual([PLANS.starter.annualPriceUsd, PLANS.pro.annualPriceUsd], [48, 144]);
  assert.deepEqual([PLANS.free.maxImagesPerLink, PLANS.starter.maxImagesPerLink, PLANS.pro.maxImagesPerLink], [5, 10, 20]);
  assert.equal(PLANS.free.analytics, "basic");
  assert.equal(PLANS.starter.analytics, "basic");
  assert.equal(PLANS.pro.analytics, "full");
});

test("custom overrides apply only to the custom plan", () => {
  assert.equal(resolveLimits("custom", { maxLinks: 100 }).maxLinks, 100);
  assert.equal(resolveLimits("custom", { maxLinks: 100 }).maxImagesPerLink, PLANS.pro.maxImagesPerLink);
  assert.equal(resolveLimits("pro", { maxLinks: 100 }).maxLinks, 30);
  assert.equal(resolveLimits("free", {}, { superAdmin: true }).maxLinks, ADMIN_MAX_LINKS);
});

test("plan overrides ignore invalid values", () => {
  assert.deepEqual(parsePlanOverrides({ maxLinks: 100, monthlyViews: -1, other: 3 }), { maxLinks: 100 });
  assert.deepEqual(parsePlanOverrides("nope"), {});
  assert.deepEqual(parsePlanOverrides({ maxLinks: 1.5 }), {});
});

test("account rows resolve to the effective plan", () => {
  const account = accountPlanFromRow({
    plan: "pro",
    effective_plan: "free",
    plan_overrides: {},
    is_super_admin: false,
    subscription_status: "CANCELLED",
    subscription_period_end: "2026-01-01T00:00:00Z",
    paypal_subscription_id: "I-1",
    paypal_subscription_plan_id: "P-1",
    pending_plan: null,
    grace_until: null,
    custom_price_usd: null,
    live_links: 3,
  });
  assert.equal(account.storedPlan, "pro");
  assert.equal(account.plan, "free");
  assert.equal(account.limits.maxLinks, 1);
  assert.equal(account.liveLinks, 3);
});

test("formatting helpers", () => {
  assert.equal(formatBytes(2 * 1024 * 1024), "2 MB");
  assert.equal(formatBytes(1.5 * 1024 * 1024), "1.5 MB");
  assert.equal(fill("{n} of {plan}", { n: 3, plan: "Pro" }), "3 of Pro");
});

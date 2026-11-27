import assert from "node:assert/strict";
import test from "node:test";
import { paidPlanForPayPalPlan, subscriptionState } from "../lib/paypal";

test("maps PayPal plan IDs to plans and intervals", () => {
  const ids = { starter: { month: "P-SM", year: "P-SY" }, pro: { month: "P-PM", year: "P-PY" } };
  assert.deepEqual(paidPlanForPayPalPlan("P-SY", ids), { plan: "starter", interval: "year" });
  assert.deepEqual(paidPlanForPayPalPlan("P-PM", ids), { plan: "pro", interval: "month" });
  assert.equal(paidPlanForPayPalPlan("P-OLD-20-DOLLAR", ids), null);
});

test("requires an owner and complete billing period for an active subscription", () => {
  const state = subscriptionState({
    id: "I-SUBSCRIPTION",
    plan_id: "P-MONTHLY",
    custom_id: "10000000-0000-4000-8000-000000000001",
    status: "ACTIVE",
    start_time: "2026-10-15T00:00:00Z",
    status_update_time: "2026-10-15T00:00:00Z",
    subscriber: { payer_id: "PAYER-1" },
    billing_info: { next_billing_time: "2026-11-15T00:00:00Z" },
  }, "2026-10-15T00:01:00Z");

  assert.equal(state?.ownerId, "10000000-0000-4000-8000-000000000001");
  assert.equal(state?.periodEnd, "2026-11-15T00:00:00Z");
  assert.equal(state?.statusUpdatedAt, "2026-10-15T00:01:00Z");
  assert.equal(subscriptionState({
    id: "I-BROKEN",
    plan_id: "P-MONTHLY",
    custom_id: "owner",
    status: "ACTIVE",
  }), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { completedCreditPack, subscriptionState } from "../lib/paypal";

test("accepts only a completed $100 USD credit-pack capture", () => {
  const payment = completedCreditPack({
    id: "ORDER-1",
    status: "COMPLETED",
    payer: { payer_id: "PAYER-1" },
    purchase_units: [{
      custom_id: "10000000-0000-4000-8000-000000000001",
      amount: { currency_code: "USD", value: "100.00" },
      payments: { captures: [{
        id: "CAPTURE-1",
        status: "COMPLETED",
        create_time: "2026-10-15T00:00:00Z",
        amount: { currency_code: "USD", value: "100.00" },
      }] },
    }],
  });

  assert.deepEqual(payment, {
    ownerId: "10000000-0000-4000-8000-000000000001",
    orderId: "ORDER-1",
    captureId: "CAPTURE-1",
    payerId: "PAYER-1",
    amount: "100.00",
    currencyCode: "USD",
    completedAt: "2026-10-15T00:00:00Z",
  });

  assert.equal(completedCreditPack({
    id: "ORDER-2",
    status: "COMPLETED",
    purchase_units: [{
      custom_id: "owner",
      amount: { currency_code: "USD", value: "99.00" },
      payments: { captures: [{
        id: "CAPTURE-2",
        status: "COMPLETED",
        amount: { currency_code: "USD", value: "99.00" },
      }] },
    }],
  }), null);
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

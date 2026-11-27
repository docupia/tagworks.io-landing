#!/usr/bin/env node

// Creates the four link-based PayPal plans (Starter and Pro, monthly and yearly)
// under the existing TagWorks product, and deactivates the retired plans.
//
// Usage:
//   printf '%s\n%s\n' "$PAYPAL_CLIENT_ID" "$PAYPAL_CLIENT_SECRET" | \
//     node scripts/setup-paypal-link-plans.mjs <product-id> [retired-plan-id ...]
//
// Add --sandbox before the product ID to use the PayPal sandbox.
// Credentials are read from stdin and are never printed or saved.
// The script is safe to run twice: PayPal-Request-Id makes each create idempotent.

const args = process.argv.slice(2);
const sandbox = args[0] === "--sandbox";
if (sandbox) args.shift();
const [productId, ...retiredPlanIds] = args;
if (!productId) throw new Error("Pass the existing PayPal product ID as the first argument.");

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const [clientId, clientSecret] = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
if (!clientId || !clientSecret) throw new Error("Expected PayPal client ID and secret on stdin.");

const baseUrl = sandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
});
const tokenBody = await tokenResponse.json();
if (!tokenResponse.ok || !tokenBody.access_token) {
  throw new Error(`PayPal OAuth failed (${tokenResponse.status}).`);
}

async function call(path, body, requestId) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`PayPal request ${path} failed (${response.status}, ${result.debug_id ?? "no-debug-id"}).`);
  }
  return result;
}

const PLANS = [
  { env: "PAYPAL_STARTER_MONTHLY_PLAN_ID", name: "TagWorks Starter Monthly — 5 links", links: 5, unit: "MONTH", price: "5.00" },
  { env: "PAYPAL_STARTER_YEARLY_PLAN_ID", name: "TagWorks Starter Yearly — 5 links", links: 5, unit: "YEAR", price: "48.00" },
  { env: "PAYPAL_PRO_MONTHLY_PLAN_ID", name: "TagWorks Pro Monthly — 30 links", links: 30, unit: "MONTH", price: "15.00" },
  { env: "PAYPAL_PRO_YEARLY_PLAN_ID", name: "TagWorks Pro Yearly — 30 links", links: 30, unit: "YEAR", price: "144.00" },
];

const output = {};
for (const plan of PLANS) {
  const created = await call("/v1/billing/plans", {
    product_id: productId,
    name: plan.name,
    description: `${plan.links} live links, unlimited edits`,
    status: "ACTIVE",
    billing_cycles: [{
      frequency: { interval_unit: plan.unit, interval_count: 1 },
      tenure_type: "REGULAR",
      sequence: 1,
      total_cycles: 0,
      pricing_scheme: { fixed_price: { value: plan.price, currency_code: "USD" } },
    }],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: "0.00", currency_code: "USD" },
      setup_fee_failure_action: "CANCEL",
      payment_failure_threshold: 1,
    },
  }, `tagworks-${plan.env.toLowerCase()}-20261128-v1`);
  output[plan.env] = created.id;
}

for (const planId of retiredPlanIds) {
  await call(`/v1/billing/plans/${encodeURIComponent(planId)}/deactivate`);
  output[`deactivated:${planId}`] = "INACTIVE";
}

process.stdout.write(JSON.stringify(output, null, 2) + "\n");

#!/usr/bin/env node

// Creates the merchant-side PayPal catalog resources used by TagWorks.
// Credentials are read from stdin as two lines and are never printed or saved.

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const [clientId, clientSecret] = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
if (!clientId || !clientSecret) throw new Error("Expected PayPal client ID and secret on stdin.");

const baseUrl = "https://api-m.paypal.com";
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

async function create(path, requestId, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "PayPal-Request-Id": requestId,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`PayPal resource creation failed (${response.status}, ${result.debug_id ?? "no-debug-id"}).`);
  }
  return result;
}

const product = await create(
  "/v1/catalogs/products",
  "tagworks-product-20261015-v1",
  {
    name: "TagWorks HTML Publishing",
    description: "Hosted HTML publishing with permanent links and analytics",
    type: "SERVICE",
    category: "SOFTWARE",
    home_url: "https://tagworks.io/pricing",
  },
);

const plan = await create(
  "/v1/billing/plans",
  "tagworks-monthly-plan-20261015-v1",
  {
    product_id: product.id,
    name: "TagWorks Pro Monthly — 50 uploads",
    description: "50 HTML uploads each billing month",
    status: "ACTIVE",
    billing_cycles: [{
      frequency: { interval_unit: "MONTH", interval_count: 1 },
      tenure_type: "REGULAR",
      sequence: 1,
      total_cycles: 0,
      pricing_scheme: {
        fixed_price: { value: "20.00", currency_code: "USD" },
      },
    }],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: "0.00", currency_code: "USD" },
      setup_fee_failure_action: "CANCEL",
      payment_failure_threshold: 1,
    },
  },
);

process.stdout.write(JSON.stringify({ productId: product.id, planId: plan.id, status: plan.status }) + "\n");

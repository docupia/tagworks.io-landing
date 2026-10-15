#!/usr/bin/env node

// Registers the production listener for the TagWorks PayPal REST app.
// Credentials are read from stdin as two lines and are never printed or saved.

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const [clientId, clientSecret] = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
if (!clientId || !clientSecret) throw new Error("Expected PayPal client ID and secret on stdin.");

const baseUrl = "https://api-m.paypal.com";
const webhookUrl = "https://tagworks.io/api/paypal/webhook";
const eventTypes = [
  "PAYMENT.CAPTURE.COMPLETED",
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.DENIED",
  "PAYMENT.SALE.REFUNDED",
].map((name) => ({ name }));

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

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`PayPal webhook setup failed (${response.status}, ${body.debug_id ?? "no-debug-id"}).`);
  }
  return body;
}

const listing = await request("/v1/notifications/webhooks?page_size=20");
let webhook = listing.webhooks?.find((candidate) => candidate.url === webhookUrl);

if (webhook) {
  webhook = await request(`/v1/notifications/webhooks/${encodeURIComponent(webhook.id)}`, {
    method: "PATCH",
    body: JSON.stringify([{ op: "replace", path: "/event_types", value: eventTypes }]),
  });
} else {
  webhook = await request("/v1/notifications/webhooks", {
    method: "POST",
    body: JSON.stringify({ url: webhookUrl, event_types: eventTypes }),
  });
}

process.stdout.write(JSON.stringify({ webhookId: webhook.id, url: webhook.url }) + "\n");

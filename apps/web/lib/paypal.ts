import { randomUUID } from "node:crypto";
import {
  getPayPalApiConfig,
  getPayPalMonthlyPlanId,
  getPayPalWebhookId,
} from "@/lib/env";

type PayPalLink = { href: string; rel: string; method?: string };

export type PayPalSubscription = {
  id: string;
  plan_id: string;
  custom_id?: string;
  status: string;
  start_time?: string;
  status_update_time?: string;
  subscriber?: { payer_id?: string; email_address?: string };
  billing_info?: {
    next_billing_time?: string;
    last_payment?: { time?: string; amount?: { currency_code?: string; value?: string } };
  };
  links?: PayPalLink[];
};

type PayPalCapture = {
  id: string;
  status: string;
  create_time?: string;
  amount?: { currency_code?: string; value?: string };
};

export type PayPalOrder = {
  id: string;
  status: string;
  payer?: { payer_id?: string };
  purchase_units?: Array<{
    custom_id?: string;
    amount?: { currency_code?: string; value?: string };
    payments?: { captures?: PayPalCapture[] };
  }>;
  links?: PayPalLink[];
};

export type PayPalWebhookEvent = {
  id: string;
  event_type: string;
  create_time?: string;
  resource?: Record<string, unknown> & { id?: string };
};

export class PayPalApiError extends Error {
  constructor(
    readonly status: number,
    readonly debugId: string | null,
  ) {
    super("PayPal could not complete the request.");
  }
}

const baseUrl = () =>
  getPayPalApiConfig().environment === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function accessToken() {
  const { clientId, clientSecret } = getPayPalApiConfig();
  const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const body = (await response.json()) as { access_token?: string; debug_id?: string };
  if (!response.ok || !body.access_token) {
    throw new PayPalApiError(response.status, body.debug_id ?? null);
  }
  return body.access_token;
}

async function paypalRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; requestId?: string } = {},
) {
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.requestId ? { "PayPal-Request-Id": options.requestId } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as T & { debug_id?: string };
  if (!response.ok) throw new PayPalApiError(response.status, body.debug_id ?? null);
  return body;
}

const approvalUrl = (links: PayPalLink[] | undefined) =>
  links?.find((link) => link.rel === "approve" || link.rel === "payer-action")?.href ?? null;

export async function createMonthlySubscription(input: {
  ownerId: string;
  email: string | null;
  returnUrl: string;
  cancelUrl: string;
}) {
  const monthlyPlanId = getPayPalMonthlyPlanId();
  const subscription = await paypalRequest<PayPalSubscription>("/v1/billing/subscriptions", {
    method: "POST",
    requestId: randomUUID(),
    body: {
      plan_id: monthlyPlanId,
      custom_id: input.ownerId,
      ...(input.email ? { subscriber: { email_address: input.email } } : {}),
      application_context: {
        brand_name: "TagWorks",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    },
  });
  const url = approvalUrl(subscription.links);
  if (!url) throw new Error("PayPal did not return a subscription approval link.");
  return { id: subscription.id, approvalUrl: url };
}

export const getPayPalSubscription = (subscriptionId: string) =>
  paypalRequest<PayPalSubscription>(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);

export async function createCreditPackOrder(input: {
  ownerId: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const order = await paypalRequest<PayPalOrder>("/v2/checkout/orders", {
    method: "POST",
    requestId: randomUUID(),
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "tagworks-prepaid-300",
          custom_id: input.ownerId,
          description: "TagWorks 300 HTML uploads",
          amount: { currency_code: "USD", value: "100.00" },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "TagWorks",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });
  const url = approvalUrl(order.links);
  if (!url) throw new Error("PayPal did not return an order approval link.");
  return { id: order.id, approvalUrl: url };
}

export const captureCreditPackOrder = (orderId: string) =>
  paypalRequest<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    requestId: `tagworks-capture-${orderId}`,
    body: {},
  });

export const getPayPalOrder = (orderId: string) =>
  paypalRequest<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);

export function completedCreditPack(order: PayPalOrder) {
  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.find((item) => item.status === "COMPLETED");
  if (
    order.status !== "COMPLETED"
    || !unit?.custom_id
    || unit.amount?.currency_code !== "USD"
    || unit.amount?.value !== "100.00"
    || !capture?.id
    || capture.amount?.currency_code !== "USD"
    || capture.amount?.value !== "100.00"
  ) return null;

  return {
    ownerId: unit.custom_id,
    orderId: order.id,
    captureId: capture.id,
    payerId: order.payer?.payer_id ?? null,
    amount: capture.amount.value,
    currencyCode: capture.amount.currency_code,
    completedAt: capture.create_time ?? new Date().toISOString(),
  };
}

export function subscriptionState(
  subscription: PayPalSubscription,
  observedAt = new Date().toISOString(),
) {
  const ownerId = subscription.custom_id;
  if (!ownerId) return null;

  const periodStart = subscription.billing_info?.last_payment?.time
    ?? subscription.start_time
    ?? (subscription.status === "ACTIVE" ? observedAt : null);
  const periodEnd = subscription.billing_info?.next_billing_time ?? null;
  if (subscription.status === "ACTIVE" && (!periodStart || !periodEnd)) return null;

  const apiStatusTime = subscription.status_update_time;
  const statusUpdatedAt = apiStatusTime && apiStatusTime > observedAt ? apiStatusTime : observedAt;

  return {
    ownerId,
    subscriptionId: subscription.id,
    planId: subscription.plan_id,
    payerId: subscription.subscriber?.payer_id ?? null,
    status: subscription.status,
    periodStart,
    periodEnd,
    statusUpdatedAt,
  };
}

export async function verifyPayPalWebhook(
  headers: Headers,
  event: PayPalWebhookEvent,
) {
  const webhookId = getPayPalWebhookId();
  const verification = await paypalRequest<{ verification_status?: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: {
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_time: headers.get("paypal-transmission-time"),
        cert_url: headers.get("paypal-cert-url"),
        auth_algo: headers.get("paypal-auth-algo"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        webhook_id: webhookId,
        webhook_event: event,
      },
    },
  );
  return verification.verification_status === "SUCCESS";
}

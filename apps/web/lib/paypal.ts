import { randomUUID } from "node:crypto";
import {
  getPayPalApiConfig,
  getPayPalPlanIds,
  getPayPalWebhookId,
} from "@/lib/env";
import type { BillingInterval } from "@/lib/plans";

export type PaidPlan = "starter" | "pro";

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

/** Maps a PayPal plan ID back to our plan and interval; null for unknown or retired plans. */
export function paidPlanForPayPalPlan(
  paypalPlanId: string,
  ids: ReturnType<typeof getPayPalPlanIds> = getPayPalPlanIds(),
): { plan: PaidPlan; interval: BillingInterval } | null {
  for (const plan of ["starter", "pro"] as const) {
    for (const interval of ["month", "year"] as const) {
      if (ids[plan][interval] === paypalPlanId) return { plan, interval };
    }
  }
  return null;
}

export async function createSubscription(input: {
  ownerId: string;
  email: string | null;
  plan: PaidPlan;
  interval: BillingInterval;
  returnUrl: string;
  cancelUrl: string;
}) {
  const subscription = await paypalRequest<PayPalSubscription>("/v1/billing/subscriptions", {
    method: "POST",
    requestId: randomUUID(),
    body: {
      plan_id: getPayPalPlanIds()[input.plan][input.interval],
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

/**
 * Moves an existing subscription to another plan or interval. Price
 * differences follow PayPal's default handling. Downgrades are applied by us
 * at the end of the paid period.
 */
export async function reviseSubscription(input: {
  subscriptionId: string;
  plan: PaidPlan;
  interval: BillingInterval;
  returnUrl: string;
  cancelUrl: string;
}) {
  const revision = await paypalRequest<{ links?: PayPalLink[] }>(
    `/v1/billing/subscriptions/${encodeURIComponent(input.subscriptionId)}/revise`,
    {
      method: "POST",
      requestId: randomUUID(),
      body: {
        plan_id: getPayPalPlanIds()[input.plan][input.interval],
        application_context: {
          brand_name: "TagWorks",
          shipping_preference: "NO_SHIPPING",
          user_action: "CONTINUE",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      },
    },
  );
  const url = approvalUrl(revision.links);
  if (!url) throw new Error("PayPal did not return a revision approval link.");
  return { approvalUrl: url };
}

export const getPayPalSubscription = (subscriptionId: string) =>
  paypalRequest<PayPalSubscription>(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);

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

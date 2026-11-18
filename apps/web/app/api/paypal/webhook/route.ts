import { NextResponse, type NextRequest } from "next/server";
import {
  grantPayPalCreditPack,
  recordPayPalWebhookEvent,
  syncPayPalSubscription,
} from "@/lib/billing";
import { getDatabase } from "@/lib/database";
import { getPayPalMonthlyPlanId } from "@/lib/env";
import {
  completedCreditPack,
  getPayPalOrder,
  getPayPalSubscription,
  subscriptionState,
  verifyPayPalWebhook,
  type PayPalWebhookEvent,
} from "@/lib/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subscriptionEvents = new Set([
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.DENIED",
  "PAYMENT.SALE.REFUNDED",
]);

function nestedString(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : null;
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 512 * 1024) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  try {
    const event = await request.json() as PayPalWebhookEvent;
    if (!event?.id || !event.event_type || typeof event.resource !== "object") {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }
    if (!(await verifyPayPalWebhook(request.headers, event))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const resource = event.resource;
    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const orderId = nestedString(resource, ["supplementary_data", "related_ids", "order_id"]);
      if (orderId) {
        const payment = completedCreditPack(await getPayPalOrder(orderId));
        if (payment) await grantPayPalCreditPack(payment);
      }
    } else if (subscriptionEvents.has(event.event_type)) {
      const subscriptionId = event.event_type.startsWith("BILLING.SUBSCRIPTION.")
        ? nestedString(resource, ["id"])
        : nestedString(resource, ["billing_agreement_id"]);
      if (subscriptionId) {
        const subscription = await getPayPalSubscription(subscriptionId);
        if (subscription.plan_id === getPayPalMonthlyPlanId()) {
          const state = subscriptionState(subscription, event.create_time);
          if (state) await syncPayPalSubscription(state);
        }
      }
    }

    const kind = event.event_type;
    if (["PAYMENT.SALE.COMPLETED", "PAYMENT.SALE.REFUNDED", "PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"].includes(kind)) {
      const transactionId = nestedString(resource, ["id"]);
      const subscription = nestedString(resource, ["billing_agreement_id"]);
      const parent = nestedString(resource, ["sale_id"]) ??
        nestedString(resource, ["supplementary_data", "related_ids", "capture_id"]);
      const rawAmount = nestedString(resource, ["amount", "total"]) ?? nestedString(resource, ["amount", "value"]);
      const currency = nestedString(resource, ["amount", "currency"]) ?? nestedString(resource, ["amount", "currency_code"]);
      const happened = nestedString(resource, ["create_time"]) ?? event.create_time;
      const refund = kind.endsWith("REFUNDED") || kind.endsWith("REVERSED");
      if (!transactionId || !rawAmount || !/^\d+(?:\.\d{1,2})?$/.test(rawAmount) ||
          Number(rawAmount) <= 0 || !currency || !/^[A-Z]{3}$/.test(currency) || !happened || !Number.isFinite(Date.parse(happened))) {
        throw new Error("Invalid affiliate payment event");
      }
      // Only successful sales and confirmed refunds enter the revenue ledger.
      const amount = (refund ? -1 : 1) * Number(rawAmount);
      const sql = getDatabase();
      await sql`select public.record_affiliate_payment(
        ${refund ? `refund:${transactionId}` : transactionId}, ${parent}, ${subscription}, ${amount},
        ${currency}, ${happened}::timestamptz, ${refund ? "refund" : "sale"}
      )`;
    }

    await recordPayPalWebhookEvent({
      id: event.id,
      type: event.event_type,
      resourceId: typeof resource.id === "string" ? resource.id : null,
      occurredAt: event.create_time ?? null,
    });
    return NextResponse.json({ received: true });
  } catch (reason) {
    console.error("PayPal webhook processing failed", reason instanceof Error ? reason.message : "unknown error");
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

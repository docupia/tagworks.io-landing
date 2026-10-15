import { NextResponse, type NextRequest } from "next/server";
import { grantPayPalCreditPack, syncPayPalSubscription } from "@/lib/billing";
import { getPayPalMonthlyPlanId, getSiteUrl } from "@/lib/env";
import {
  captureCreditPackOrder,
  completedCreditPack,
  getPayPalOrder,
  getPayPalSubscription,
  PayPalApiError,
  subscriptionState,
} from "@/lib/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validPayPalId = (value: string | null) =>
  value && value.length <= 64 && /^[A-Z0-9-]+$/i.test(value) ? value : null;

const billingRedirect = (state: string) =>
  NextResponse.redirect(`${getSiteUrl()}/billing?payment=${encodeURIComponent(state)}`, 303);

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");

  try {
    if (kind === "monthly") {
      const subscriptionId = validPayPalId(
        request.nextUrl.searchParams.get("subscription_id"),
      );
      if (!subscriptionId) return billingRedirect("error");

      const subscription = await getPayPalSubscription(subscriptionId);
      if (subscription.plan_id !== getPayPalMonthlyPlanId()) return billingRedirect("error");
      const state = subscriptionState(subscription);
      if (!state) return billingRedirect("processing");
      await syncPayPalSubscription(state);
      return billingRedirect(state.status === "ACTIVE" ? "success" : "processing");
    }

    if (kind === "prepaid") {
      const orderId = validPayPalId(request.nextUrl.searchParams.get("token"));
      if (!orderId) return billingRedirect("error");

      let order;
      try {
        order = await captureCreditPackOrder(orderId);
      } catch (reason) {
        if (!(reason instanceof PayPalApiError) || reason.status !== 422) throw reason;
        order = await getPayPalOrder(orderId);
      }
      const payment = completedCreditPack(order);
      if (!payment) return billingRedirect("processing");
      await grantPayPalCreditPack(payment);
      return billingRedirect("success");
    }

    return billingRedirect("error");
  } catch (reason) {
    if (reason instanceof PayPalApiError) {
      console.error("PayPal return failed", { status: reason.status, debugId: reason.debugId });
    } else {
      console.error("PayPal return failed", reason instanceof Error ? reason.message : "unknown error");
    }
    return billingRedirect("error");
  }
}

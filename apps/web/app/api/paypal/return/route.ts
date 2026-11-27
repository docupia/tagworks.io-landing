import { NextResponse, type NextRequest } from "next/server";
import { syncSubscriptionFromPayPal } from "@/lib/billing";
import { getSiteUrl } from "@/lib/env";
import { PayPalApiError } from "@/lib/paypal";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validPayPalId = (value: string | null) =>
  value && value.length <= 64 && /^[A-Z0-9-]+$/i.test(value) ? value : null;

const billingRedirect = (state: string) =>
  NextResponse.redirect(`${getSiteUrl()}/billing?payment=${encodeURIComponent(state)}`, 303);

/** PayPal sends the subscriber back here after approving a new or changed subscription. */
export async function GET(request: NextRequest) {
  try {
    const subscriptionId = validPayPalId(request.nextUrl.searchParams.get("subscription_id"));
    if (!subscriptionId) return billingRedirect("error");

    const result = await syncSubscriptionFromPayPal(subscriptionId);
    if (!result) return billingRedirect("processing");

    // Only the subscriber's own session gets a success message.
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (user && user.id !== result.ownerId) return billingRedirect("error");
    return billingRedirect(result.status === "ACTIVE" ? "success" : "processing");
  } catch (reason) {
    if (reason instanceof PayPalApiError) {
      console.error("PayPal return failed", { status: reason.status, debugId: reason.debugId });
    } else {
      console.error("PayPal return failed", reason instanceof Error ? reason.message : "unknown error");
    }
    return billingRedirect("error");
  }
}

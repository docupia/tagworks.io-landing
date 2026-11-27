import { NextResponse, type NextRequest } from "next/server";
import { getAccountPlan } from "@/lib/account-plan";
import { getSiteUrl } from "@/lib/env";
import { LOCALE_COOKIE, normalizeLocale, text } from "@/lib/i18n";
import { createSubscription, PayPalApiError, paidPlanForPayPalPlan, reviseSubscription } from "@/lib/paypal";
import { BILLING_INTERVALS, type BillingInterval } from "@/lib/plans";
import { isSameOriginMutation } from "@/lib/request-security";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const locale = normalizeLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  const tx = (english: string, korean: string) => text(locale, english, korean);

  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: tx("This request is not allowed.", "허용되지 않은 요청입니다.") }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: tx("Log in to continue.", "로그인이 필요합니다.") }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { plan?: unknown; interval?: unknown } | null;
  const plan = body?.plan;
  const interval = body?.interval ?? "month";
  if ((plan !== "starter" && plan !== "pro") || !BILLING_INTERVALS.includes(interval as BillingInterval)) {
    return NextResponse.json({ error: tx("Choose a valid plan.", "올바른 플랜을 선택해 주세요.") }, { status: 400 });
  }

  try {
    const account = await getAccountPlan(user.id);
    if (account.superAdmin || account.storedPlan === "custom") {
      return NextResponse.json(
        { error: tx("Your plan is managed by TagWorks. Contact us to change it.", "이 계정의 플랜은 TagWorks에서 관리합니다. 변경하려면 문의해 주세요.") },
        { status: 409 },
      );
    }

    const siteUrl = getSiteUrl();
    const returnUrl = `${siteUrl}/api/paypal/return`;
    const cancelUrl = `${siteUrl}/billing?payment=cancelled`;
    const active = account.paypalSubscriptionId && account.subscriptionStatus === "ACTIVE";

    if (active) {
      const current = account.paypalPlanId ? paidPlanForPayPalPlan(account.paypalPlanId) : null;
      if (current?.plan === plan && current.interval === interval && !account.pendingPlan) {
        return NextResponse.json({ error: tx("You are already on this plan.", "이미 이용 중인 플랜입니다.") }, { status: 409 });
      }
      const revision = await reviseSubscription({
        subscriptionId: account.paypalSubscriptionId!,
        plan,
        interval: interval as BillingInterval,
        returnUrl: `${returnUrl}?subscription_id=${encodeURIComponent(account.paypalSubscriptionId!)}`,
        cancelUrl,
      });
      return NextResponse.json({ approvalUrl: revision.approvalUrl }, { status: 201 });
    }

    const checkout = await createSubscription({
      ownerId: user.id,
      email: user.email ?? null,
      plan,
      interval: interval as BillingInterval,
      returnUrl,
      cancelUrl,
    });
    return NextResponse.json({ approvalUrl: checkout.approvalUrl }, { status: 201 });
  } catch (reason) {
    if (reason instanceof PayPalApiError) {
      console.error("PayPal checkout failed", { status: reason.status, debugId: reason.debugId });
    } else {
      console.error("PayPal checkout failed", reason instanceof Error ? reason.message : "unknown error");
    }
    return NextResponse.json(
      { error: tx("PayPal checkout is temporarily unavailable. Please try again.", "PayPal 결제를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.") },
      { status: 502 },
    );
  }
}

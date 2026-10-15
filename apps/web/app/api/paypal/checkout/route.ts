import { NextResponse, type NextRequest } from "next/server";
import { getUploadEntitlement } from "@/lib/billing";
import { getSiteUrl } from "@/lib/env";
import { LOCALE_COOKIE, normalizeLocale, text } from "@/lib/i18n";
import {
  createCreditPackOrder,
  createMonthlySubscription,
  PayPalApiError,
} from "@/lib/paypal";
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

  const body = await request.json().catch(() => null) as { plan?: unknown } | null;
  if (body?.plan !== "monthly" && body?.plan !== "prepaid") {
    return NextResponse.json({ error: tx("Choose a valid plan.", "올바른 플랜을 선택해 주세요.") }, { status: 400 });
  }

  try {
    const entitlement = await getUploadEntitlement(user.id);
    if (entitlement.tier === "admin") {
      return NextResponse.json(
        { error: tx("Your administrator account already has unlimited uploads.", "관리자 계정에는 이미 무제한 업로드 권한이 있습니다.") },
        { status: 409 },
      );
    }

    if (body.plan === "monthly") {
      if (
        entitlement.subscriptionStatus === "ACTIVE"
        && entitlement.subscriptionPeriodEnd
        && new Date(entitlement.subscriptionPeriodEnd) > new Date()
      ) {
        return NextResponse.json(
          { error: tx("Your monthly plan is already active.", "이미 월간 플랜을 이용 중입니다.") },
          { status: 409 },
        );
      }
    }

    const siteUrl = getSiteUrl();
    const checkout = body.plan === "monthly"
      ? await createMonthlySubscription({
          ownerId: user.id,
          email: user.email ?? null,
          returnUrl: `${siteUrl}/api/paypal/return?kind=monthly`,
          cancelUrl: `${siteUrl}/billing?payment=cancelled`,
        })
      : await createCreditPackOrder({
          ownerId: user.id,
          returnUrl: `${siteUrl}/api/paypal/return?kind=prepaid`,
          cancelUrl: `${siteUrl}/billing?payment=cancelled`,
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

import { getAccountPlan } from "@/lib/account-plan";
import { getCurrentUser } from "@/lib/current-user";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { paidPlanForPayPalPlan } from "@/lib/paypal";
import { PlanCards, type ViewerState } from "./plan-cards";
import styles from "./pricing.module.css";

export async function viewerState(userId: string | null): Promise<ViewerState> {
  if (!userId) return { kind: "guest" };
  const account = await getAccountPlan(userId);
  let interval = null;
  try {
    interval = account.paypalPlanId ? paidPlanForPayPalPlan(account.paypalPlanId)?.interval ?? null : null;
  } catch {
    // PayPal plan IDs are not configured in this environment.
  }
  return {
    kind: "member",
    plan: account.plan,
    interval,
    managed: account.superAdmin || account.storedPlan === "custom",
  };
}

export async function PricingSection() {
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const user = await getCurrentUser();
  const viewer = await viewerState(user?.id ?? null);

  return (
    <section id="pricing" className={styles.main} aria-labelledby="pricing-title">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>{tx("Simple, clear pricing", "간단하고 명확한 요금제")}</p>
        <h2 id="pricing-title">{tx("Pay for live links. Edit as often as you like.", "공개 링크 수만큼만 내고, 수정은 마음껏.")}</h2>
        <p>{tx("Every plan includes unlimited edits, image uploads and a permanent URL with a QR code.", "모든 플랜에서 수정 무제한, 이미지 업로드, QR 코드가 있는 고정 URL을 쓸 수 있어요.")}</p>
      </div>

      <PlanCards locale={locale} viewer={viewer} />

      <p className={styles.finePrint}>{tx("Payments are processed securely by PayPal in USD. Subscriptions renew until you cancel in PayPal, and you keep your plan until the end of the period you paid for.", "결제는 PayPal에서 미화로 안전하게 처리됩니다. 구독은 PayPal에서 해지할 때까지 갱신되며, 해지해도 결제한 기간이 끝날 때까지 플랜이 유지됩니다.")}</p>
    </section>
  );
}

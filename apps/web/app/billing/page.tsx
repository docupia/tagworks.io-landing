import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LanguageSwitcher } from "@/app/components/language-switcher";
import { PayPalCheckoutButton } from "@/app/components/paypal-checkout-button";
import { getUploadEntitlement } from "@/lib/billing";
import { LOCALE_TAGS, text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import styles from "@/app/pricing/pricing.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "Billing", "결제 관리") };
}

const messages: Record<string, [string, string]> = {
  success: ["Your PayPal payment is complete and your upload allowance is ready.", "PayPal 결제가 완료되어 업로드 권한이 반영되었습니다."],
  processing: ["PayPal is still confirming the payment. Your allowance will update automatically.", "PayPal이 결제를 확인 중입니다. 완료되면 업로드 권한이 자동 반영됩니다."],
  cancelled: ["The PayPal checkout was canceled. No charge was made here.", "PayPal 결제가 취소되었습니다. 이 화면에서는 결제되지 않았습니다."],
  error: ["We could not confirm the PayPal payment. If you were charged, the webhook will reconcile it automatically.", "PayPal 결제를 확인하지 못했습니다. 결제가 완료됐다면 웹훅을 통해 자동으로 반영됩니다."],
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const entitlement = await getUploadEntitlement(user.id);
  const isSuperAdmin = entitlement.tier === "admin";
  const { payment } = await searchParams;
  const message = payment && messages[payment] ? messages[payment] : null;
  const periodEnd = entitlement.subscriptionPeriodEnd
    ? new Intl.DateTimeFormat(LOCALE_TAGS[locale], { year: "numeric", month: "short", day: "numeric" }).format(new Date(entitlement.subscriptionPeriodEnd))
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/"><span className={styles.brandMark}>T</span>TagWorks</Link>
        <div className={styles.headerActions}>
          <LanguageSwitcher locale={locale} />
          <Link className={styles.textLink} href="/dashboard">{tx("Dashboard", "대시보드")}</Link>
          <form action="/auth/signout" method="post"><button className={styles.textLink} style={{ border: 0, background: "none", cursor: "pointer" }} type="submit">{tx("Log out", "로그아웃")}</button></form>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{tx("Billing and allowance", "결제 및 업로드 권한")}</p>
          <h1>{tx("Your TagWorks plan", "내 TagWorks 플랜")}</h1>
          <p>{tx("Check your remaining uploads or add a plan through PayPal.", "남은 업로드 수를 확인하거나 PayPal로 플랜을 추가하세요.")}</p>
        </div>

        {message ? <div className={styles.notice}>{tx(message[0], message[1])}</div> : null}

        <section className={styles.usage} aria-label={tx("Current allowance", "현재 업로드 권한")}>
          <article><span>{tx("Current plan", "현재 플랜")}</span><strong>{isSuperAdmin ? tx("Super administrator", "최고관리자") : entitlement.tier === "monthly" ? tx("Pro monthly", "프로 월간") : entitlement.paidCustomer ? tx("Prepaid pack", "선불 팩") : tx("Free", "무료")}</strong></article>
          <article><span>{tx("Uploads available now", "현재 업로드 가능")}</span><strong>{isSuperAdmin ? tx("Unlimited", "무제한") : entitlement.totalRemaining.toLocaleString(LOCALE_TAGS[locale])}</strong></article>
          <article><span>{tx("Prepaid uploads remaining", "남은 선불 업로드")}</span><strong>{entitlement.prepaidRemaining.toLocaleString(LOCALE_TAGS[locale])}</strong></article>
        </section>

        {entitlement.tier === "monthly" ? (
          <div className={styles.notice}>
            {tx(`${entitlement.monthlyRemaining} of 50 monthly uploads remain${periodEnd ? ` until ${periodEnd}` : ""}.`, `월간 업로드 50개 중 ${entitlement.monthlyRemaining}개가 남았습니다${periodEnd ? ` · ${periodEnd}까지` : ""}.`)}{" "}
            <a href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noreferrer">{tx("Manage subscription in PayPal", "PayPal에서 구독 관리")}</a>
          </div>
        ) : null}

        {isSuperAdmin ? (
          <div className={styles.notice}>
            {tx("Super administrator access is active. HTML uploads do not consume an allowance.", "최고관리자 권한이 활성화되어 있습니다. HTML 업로드 시 이용량이 차감되지 않습니다.")} {" "}
            <Link href="/pages/new">{tx("Upload HTML", "HTML 업로드")}</Link>
          </div>
        ) : (
        <section className={styles.plans} style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", maxWidth: 780, margin: "0 auto" }}>
          <article className={`${styles.plan} ${styles.featured}`} style={{ minHeight: 360 }}>
            <p className={styles.planName}>{tx("Pro monthly", "프로 월간")}</p>
            <p className={styles.price}><strong>$20</strong><span>{tx("per month", "매월")}</span></p>
            <ul className={styles.features}><li>{tx("50 uploads every billing month", "결제월마다 50개 업로드")}</li><li>{tx("Automatic monthly renewal", "매월 자동 갱신")}</li></ul>
            {entitlement.tier === "monthly" ? <Link className={`${styles.action} ${styles.secondary}`} href="/pages/new">{tx("Upload HTML", "HTML 업로드")}</Link> : <PayPalCheckoutButton plan="monthly" locale={locale} label={tx("Subscribe with PayPal", "PayPal로 구독")} className={styles.paypalButton} />}
          </article>
          <article className={styles.plan} style={{ minHeight: 360 }}>
            <p className={styles.planName}>{tx("Prepaid pack", "선불 팩")}</p>
            <p className={styles.price}><strong>$100</strong><span>{tx("one time", "1회 결제")}</span></p>
            <ul className={styles.features}><li>{tx("300 uploads with no expiration", "기간 제한 없는 300개 업로드")}</li><li>{tx("Stacks with your existing balance", "기존 잔여 수량에 누적")}</li></ul>
            <PayPalCheckoutButton plan="prepaid" locale={locale} label={tx("Buy with PayPal", "PayPal로 구매")} className={styles.paypalButton} />
          </article>
        </section>
        )}
      </main>
    </div>
  );
}

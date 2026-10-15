import type { Metadata } from "next";
import Link from "next/link";
import { LanguageSwitcher } from "@/app/components/language-switcher";
import { PayPalCheckoutButton } from "@/app/components/paypal-checkout-button";
import { getUploadEntitlement } from "@/lib/billing";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import styles from "./pricing.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: text(locale, "Pricing", "요금제"),
    description: text(locale, "Choose a TagWorks HTML publishing plan.", "TagWorks HTML 게시 플랜을 선택하세요."),
  };
}

export default async function PricingPage() {
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const entitlement = user ? await getUploadEntitlement(user.id) : null;
  const activeMonthly = entitlement?.tier === "monthly";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/"><span className={styles.brandMark}>T</span>TagWorks</Link>
        <div className={styles.headerActions}>
          <LanguageSwitcher locale={locale} />
          <Link className={styles.textLink} href={user ? "/dashboard" : "/login"}>
            {user ? tx("Dashboard", "대시보드") : tx("Log in", "로그인")}
          </Link>
          {user ? <Link className={styles.textLink} href="/billing">{tx("Billing", "결제 관리")}</Link> : null}
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{tx("Simple, clear pricing", "간단하고 명확한 요금제")}</p>
          <h1>{tx("Publish at your own pace.", "필요한 만큼 게시하세요.")}</h1>
          <p>{tx("Start with one free HTML upload. Subscribe for a monthly allowance or buy a no-expiration upload pack.", "HTML 1개를 무료로 시작하세요. 매월 제공되는 플랜 또는 기간 제한 없는 업로드 팩을 선택할 수 있습니다.")}</p>
        </div>

        {activeMonthly ? <div className={styles.notice}>{tx("Your $20 monthly plan is active.", "$20 월간 플랜을 이용 중입니다.")}</div> : null}

        <section className={styles.plans} aria-label={tx("TagWorks plans", "TagWorks 요금제")}>
          <article className={styles.plan}>
            <p className={styles.planName}>{tx("Free", "무료")}</p>
            <p className={styles.price}><strong>$0</strong><span>{tx("forever", "계속 무료")}</span></p>
            <p className={styles.description}>{tx("Try the complete publishing flow with your first page.", "첫 페이지로 전체 게시 과정을 경험해 보세요.")}</p>
            <ul className={styles.features}>
              <li>{tx("1 HTML upload per account", "계정당 HTML 1개 업로드")}</li>
              <li>{tx("Permanent public link and QR code", "고정 공개 링크와 QR 코드")}</li>
              <li>{tx("Visit and outbound-link analytics", "방문 및 외부 링크 분석")}</li>
            </ul>
            <Link className={`${styles.action} ${styles.secondary}`} href={user ? "/pages/new" : "/signup"}>
              {user ? tx("Use free upload", "무료 업로드 사용") : tx("Start free", "무료로 시작하기")}
            </Link>
          </article>

          <article className={`${styles.plan} ${styles.featured}`}>
            <span className={styles.ribbon}>{tx("Monthly", "월간")}</span>
            <p className={styles.planName}>{tx("Pro monthly", "프로 월간")}</p>
            <p className={styles.price}><strong>$20</strong><span>{tx("per month", "매월")}</span></p>
            <p className={styles.description}>{tx("For regular publishing with a fresh allowance every billing month.", "매 결제월마다 업로드 수가 새로 제공되는 정기 게시용 플랜입니다.")}</p>
            <ul className={styles.features}>
              <li>{tx("50 HTML uploads each billing month", "결제월마다 HTML 50개 업로드")}</li>
              <li>{tx("Renews monthly until canceled", "해지 전까지 매월 자동 결제")}</li>
              <li>{tx("Unused monthly uploads do not roll over", "남은 월간 업로드는 이월되지 않음")}</li>
            </ul>
            {activeMonthly ? (
              <Link className={`${styles.action} ${styles.secondary}`} href="/billing">{tx("Current plan", "현재 플랜")}</Link>
            ) : user ? (
              <PayPalCheckoutButton plan="monthly" locale={locale} label={tx("Subscribe for $20", "$20 월간 구독")} className={styles.paypalButton} />
            ) : (
              <Link className={styles.action} href="/login?next=/billing">{tx("Log in to subscribe", "로그인하고 구독")}</Link>
            )}
          </article>

          <article className={styles.plan}>
            <p className={styles.planName}>{tx("Prepaid pack", "선불 팩")}</p>
            <p className={styles.price}><strong>$100</strong><span>{tx("one time", "1회 결제")}</span></p>
            <p className={styles.description}>{tx("Buy a large upload pack once and use it whenever you need.", "한 번 구매한 뒤 필요한 때에 나누어 사용할 수 있는 업로드 팩입니다.")}</p>
            <ul className={styles.features}>
              <li>{tx("300 HTML uploads", "HTML 300개 업로드")}</li>
              <li>{tx("No expiration date", "사용 기간 제한 없음")}</li>
              <li>{tx("Additional packs add another 300 uploads", "추가 구매 시 300개씩 누적")}</li>
            </ul>
            {user ? (
              <PayPalCheckoutButton plan="prepaid" locale={locale} label={tx("Buy 300 uploads", "업로드 300개 구매")} className={styles.paypalButton} />
            ) : (
              <Link className={styles.action} href="/login?next=/billing">{tx("Log in to buy", "로그인하고 구매")}</Link>
            )}
          </article>
        </section>

        <p className={styles.finePrint}>{tx("Payments are processed securely by PayPal. The monthly plan renews at $20 USD each month until canceled in PayPal. The $100 USD pack is a one-time payment and its upload credits do not expire.", "결제는 PayPal에서 안전하게 처리됩니다. 월간 플랜은 PayPal에서 해지할 때까지 매월 미화 $20로 갱신되며, 미화 $100 선불 팩은 1회 결제이고 업로드 권한에 만료일이 없습니다.")}</p>
      </main>
    </div>
  );
}

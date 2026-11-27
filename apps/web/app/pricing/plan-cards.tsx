"use client";

import Link from "next/link";
import { useState } from "react";
import { PayPalCheckoutButton } from "@/app/components/paypal-checkout-button";
import { text, type Locale } from "@/lib/i18n";
import { fill, formatBytes, PLANS, PUBLIC_PLAN_IDS, type BillingInterval, type PlanId } from "@/lib/plans";
import styles from "./pricing.module.css";

export type ViewerState =
  | { kind: "guest" }
  | { kind: "member"; plan: PlanId; interval: BillingInterval | null; managed: boolean };

/** The three public plan cards with a monthly/yearly switch. */
export function PlanCards({ locale, viewer }: { locale: Locale; viewer: ViewerState }) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const [interval, setInterval] = useState<BillingInterval>(
    viewer.kind === "member" && viewer.interval === "year" ? "year" : "month",
  );

  const features = (id: PlanId) => {
    const plan = PLANS[id];
    return [
      id === "free"
        ? tx("1 live link", "공개 링크 1개")
        : fill(tx("{n} live links", "공개 링크 {n}개"), { n: plan.maxLinks }),
      tx("Unlimited edits · same URL and QR code", "수정 무제한 · URL과 QR 그대로"),
      fill(tx("Up to {n} images per link, optimized automatically", "링크당 이미지 {n}장, 자동 최적화"), { n: plan.maxImagesPerLink }),
      plan.analytics === "full"
        ? tx("Full analytics: visit flow, period comparison, CSV, all history", "전체 분석: 방문 흐름, 기간 비교, CSV, 전체 기간")
        : tx("Basic analytics for the last 30 days", "최근 30일 기본 분석"),
      id === "free"
        ? tx("Small TagWorks badge on your page", "페이지에 작은 TagWorks 배지 표시")
        : tx("No TagWorks badge", "TagWorks 배지 없음"),
      fill(tx("Pages up to {size} each", "링크당 최대 {size}"), { size: formatBytes(plan.maxLinkBytes) }),
    ];
  };

  const action = (id: PlanId) => {
    if (viewer.kind === "guest") {
      return id === "free"
        ? <Link className={`${styles.action} ${styles.secondary}`} href="/signup">{tx("Start free", "무료로 시작하기")}</Link>
        : <Link className={styles.action} href="/login?next=/billing">{tx("Log in to subscribe", "로그인하고 구독")}</Link>;
    }
    const current = viewer.plan === id && (id === "free" || viewer.interval === interval);
    if (current) return <span className={`${styles.action} ${styles.secondary}`} aria-current="true">{tx("Current plan", "현재 플랜")}</span>;
    if (viewer.managed) return <span className={`${styles.action} ${styles.secondary}`}>{tx("Managed by TagWorks", "TagWorks에서 관리")}</span>;
    if (id === "free") {
      return viewer.plan === "free"
        ? <Link className={`${styles.action} ${styles.secondary}`} href="/pages/new">{tx("Upload HTML", "HTML 업로드")}</Link>
        : <a className={`${styles.action} ${styles.secondary}`} href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noreferrer">{tx("Cancel in PayPal", "PayPal에서 해지")}</a>;
    }
    const plan = id as "starter" | "pro";
    const label = id === "starter" ? tx("Choose Starter", "Starter 선택") : tx("Choose Pro", "Pro 선택");
    return <PayPalCheckoutButton plan={plan} interval={interval} locale={locale} label={label} className={styles.paypalButton} />;
  };

  return (
    <>
      <div className={styles.intervalSwitch} role="radiogroup" aria-label={tx("Billing period", "결제 주기")}>
        {(["month", "year"] as const).map((value) => (
          <button key={value} type="button" role="radio" aria-checked={interval === value} onClick={() => setInterval(value)}>
            {value === "month" ? tx("Monthly", "월간") : tx("Yearly", "연간")}
            {value === "year" ? <span>{tx("Save 20%", "20% 할인")}</span> : null}
          </button>
        ))}
      </div>

      <section className={styles.plans} aria-label={tx("TagWorks plans", "TagWorks 요금제")}>
        {PUBLIC_PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const yearly = interval === "year" && plan.annualPriceUsd !== null;
          return (
            <article className={`${styles.plan} ${id === "starter" ? styles.featured : ""}`} key={id}>
              {id === "starter" ? <span className={styles.ribbon}>{tx("Most popular", "가장 인기")}</span> : null}
              <p className={styles.planName}>{plan.name}</p>
              <p className={styles.price}>
                <strong>${yearly ? plan.annualPriceUsd : plan.priceUsd}</strong>
                <span>{id === "free" ? tx("forever", "계속 무료") : yearly ? tx("per year", "매년") : tx("per month", "매월")}</span>
              </p>
              <p className={styles.description}>
                {yearly
                  ? fill(tx("${monthly} a month, billed yearly", "월 ${monthly}, 1년 단위 결제"), { monthly: (plan.annualPriceUsd! / 12).toFixed(0) })
                  : id === "free" ? tx("Try the full publishing flow with one page.", "페이지 하나로 전체 게시 과정을 써 보세요.")
                    : id === "starter" ? tx("For a few pages you keep up to date.", "몇 개의 페이지를 꾸준히 고쳐 쓰는 분께.")
                      : tx("For many pages and detailed analytics.", "많은 페이지와 자세한 분석이 필요한 분께.")}
              </p>
              <ul className={styles.features}>
                {features(id).map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              {action(id)}
            </article>
          );
        })}
      </section>

      <p className={styles.customLine}>
        {fill(tx("Need more than {n} links?", "링크가 {n}개보다 더 필요하세요?"), { n: PLANS.pro.maxLinks })}{" "}
        <Link href="/contact">{tx("Tell us how many and we'll set it up for you.", "필요한 개수를 알려 주시면 맞춰 드릴게요.")}</Link>
      </p>
    </>
  );
}

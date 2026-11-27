import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlanCards } from "@/app/pricing/plan-cards";
import { viewerState } from "@/app/pricing/section";
import { getReconciledAccountPlan } from "@/lib/account-plan";
import { getDatabase } from "@/lib/database";
import { LOCALE_TAGS, text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { fill, PLANS, type PlanId } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import styles from "@/app/pricing/pricing.module.css";
import { saveKeptLinks } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "Billing", "결제 관리") };
}

const messages: Record<string, [string, string]> = {
  success: ["Your PayPal subscription is active and your plan has been updated.", "PayPal 구독이 시작되어 플랜이 반영되었습니다."],
  processing: ["PayPal is still confirming the payment. Your plan will update automatically.", "PayPal이 결제를 확인 중입니다. 완료되면 플랜이 자동으로 반영됩니다."],
  cancelled: ["The PayPal checkout was canceled. No charge was made here.", "PayPal 결제가 취소되었습니다. 이 화면에서는 결제되지 않았습니다."],
  error: ["We could not confirm the PayPal payment. If you were charged, the webhook will reconcile it automatically.", "PayPal 결제를 확인하지 못했습니다. 결제가 완료됐다면 웹훅을 통해 자동으로 반영됩니다."],
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; kept?: string }>;
}) {
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/billing");

  const account = await getReconciledAccountPlan(user.id);
  const viewer = await viewerState(user.id);
  const { payment, kept } = await searchParams;
  const message = payment && messages[payment] ? messages[payment] : null;
  const date = (value: string | null) => value
    ? new Intl.DateTimeFormat(LOCALE_TAGS[locale], { year: "numeric", month: "short", day: "numeric" }).format(new Date(value))
    : null;
  const periodEnd = date(account.subscriptionPeriodEnd);
  const cancelled = ["CANCELLED", "SUSPENDED", "EXPIRED"].includes(account.subscriptionStatus ?? "")
    && account.plan !== "free" && account.plan !== "custom";
  const inGrace = Boolean(account.graceUntil && new Date(account.graceUntil) > new Date());

  // A scheduled downgrade or a cancellation ends with fewer allowed links.
  const target: PlanId | null = account.pendingPlan ?? (cancelled ? "free" : null);
  const targetMax = target ? PLANS[target].maxLinks : null;
  const needsChoice = target !== null && targetMax !== null && account.liveLinks > targetMax;
  const liveLinks = needsChoice
    ? await getDatabase()<{ id: string; title: string; keep_on_downgrade: boolean }[]>`
        select id, title, keep_on_downgrade
        from public.pages
        where owner_id = ${user.id}::uuid and status = 'published' and deleted_at is null
        order by keep_on_downgrade desc, coalesce(last_edited_at, published_at, created_at) desc
      `
    : [];

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{tx("Billing", "결제 관리")}</p>
          <h1>{tx("Your TagWorks plan", "내 TagWorks 플랜")}</h1>
          <p>{tx("Plans are based on how many links are live. Edits are always unlimited.", "플랜은 공개 중인 링크 수로 정해지고, 수정은 언제나 무제한이에요.")}</p>
        </div>

        {message ? <div className={styles.notice}>{tx(message[0], message[1])}</div> : null}
        {kept === "saved" ? <div className={styles.notice}>{tx("Saved. These links stay public after the change.", "저장했어요. 플랜이 바뀐 뒤에도 고른 링크는 공개로 남아요.")}</div> : null}
        {kept === "too_many" && targetMax !== null ? <div className={styles.notice}>{fill(tx("Choose up to {n} links.", "링크는 {n}개까지 고를 수 있어요."), { n: targetMax })}</div> : null}

        <section className={styles.usage} aria-label={tx("Current plan", "현재 플랜")}>
          <article><span>{tx("Current plan", "현재 플랜")}</span><strong>{account.superAdmin ? tx("Super administrator", "최고관리자") : account.limits.name}</strong></article>
          <article><span>{tx("Live links", "공개 링크")}</span><strong>{account.superAdmin ? account.liveLinks.toLocaleString(LOCALE_TAGS[locale]) : `${account.liveLinks} / ${account.limits.maxLinks}`}</strong></article>
          <article><span>{cancelled ? tx("Plan ends", "플랜 종료일") : tx("Next renewal", "다음 갱신일")}</span><strong>{account.plan === "free" || account.plan === "custom" ? "—" : periodEnd ?? "—"}</strong></article>
        </section>

        {inGrace ? (
          <div className={styles.notice}>
            {fill(tx("Your last payment did not go through. Your plan stays active until {date}. Update your payment method in PayPal.", "최근 결제가 완료되지 않았어요. {date}까지는 현재 플랜이 유지됩니다. PayPal에서 결제 수단을 바꿔 주세요."), { date: date(account.graceUntil) ?? "" })}{" "}
            <a href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noreferrer">{tx("Open PayPal", "PayPal 열기")}</a>
          </div>
        ) : null}
        {account.pendingPlan ? (
          <div className={styles.notice}>
            {fill(tx("Your plan changes to {plan} on {date}. Until then you keep {current}.", "{date}에 {plan} 플랜으로 바뀌어요. 그때까지는 {current} 플랜을 그대로 쓸 수 있어요."), { plan: PLANS[account.pendingPlan].name, date: periodEnd ?? "", current: account.limits.name })}
          </div>
        ) : cancelled ? (
          <div className={styles.notice}>
            {fill(tx("Your subscription is cancelled. You keep {plan} until {date}, then move to Free.", "구독이 해지되었어요. {date}까지는 {plan} 플랜을 쓰고, 그 뒤 Free로 바뀌어요."), { plan: account.limits.name, date: periodEnd ?? "" })}
          </div>
        ) : null}

        {needsChoice && target && targetMax !== null ? (
          <section className={styles.downgradeCard} aria-labelledby="keep-title">
            <h2 id="keep-title">{fill(tx("Choose up to {n} links to keep public", "공개로 남길 링크를 {n}개까지 골라 주세요"), { n: targetMax })}</h2>
            <p>{tx("The rest become private, not deleted, and come back at the same URL when you upgrade again. If you don't choose, the most recently edited links stay public.", "나머지는 삭제되지 않고 비공개가 되며, 다시 업그레이드하면 같은 주소로 돌아와요. 고르지 않으면 최근에 수정한 링크가 남아요.")}</p>
            <form action={saveKeptLinks}>
              <ul className={styles.downgradeList}>
                {liveLinks.map((link) => (
                  <li key={link.id}>
                    <label><input type="checkbox" name="keep" value={link.id} defaultChecked={link.keep_on_downgrade} /> {link.title}</label>
                  </li>
                ))}
              </ul>
              <button className={styles.action} type="submit">{tx("Save my choice", "선택 저장")}</button>
            </form>
          </section>
        ) : null}

        {account.superAdmin ? (
          <div className={styles.notice}>
            {tx("Super administrator access is active. Links are not limited.", "최고관리자 권한이 활성화되어 있어 링크 수 제한이 없습니다.")}{" "}
            <Link href="/pages/new">{tx("Upload HTML", "HTML 업로드")}</Link>
          </div>
        ) : account.storedPlan === "custom" ? (
          <div className={styles.notice}>
            {tx("Your account is on a custom plan managed by TagWorks.", "이 계정은 TagWorks가 관리하는 Custom 플랜이에요.")}{" "}
            <Link href="/contact">{tx("Contact us", "문의하기")}</Link>
          </div>
        ) : (
          <PlanCards locale={locale} viewer={viewer} />
        )}

        {account.paypalSubscriptionId && !account.superAdmin ? (
          <p className={styles.finePrint}>
            <a href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noreferrer">{tx("Manage or cancel your subscription in PayPal", "PayPal에서 구독 관리·해지")}</a>
          </p>
        ) : null}
      </main>
    </div>
  );
}

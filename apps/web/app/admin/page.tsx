import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAccountPlan } from "@/lib/account-plan";
import { getSuperAdmin, INQUIRY_STATUSES, type InquiryStatus } from "@/lib/admin";
import { getDatabase } from "@/lib/database";
import { LOCALE_TAGS, text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { fill, parsePlanOverrides, PLANS } from "@/lib/plans";
import { setCustomPlan, updateInquiry } from "./actions";
import styles from "./admin.module.css";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

type InquiryRow = {
  id: string;
  owner_id: string | null;
  email: string;
  links_needed: number;
  monthly_views: number | null;
  use_case: string;
  locale: string;
  status: InquiryStatus;
  admin_note: string | null;
  created_at: Date;
};

type AccountRow = {
  owner_id: string;
  email: string;
  plan: string;
  plan_overrides: unknown;
  custom_price_usd: string | null;
  contract_note: string | null;
  is_super_admin: boolean;
  subscription_status: string | null;
  live_links: number;
};

type CustomAccountRow = Pick<AccountRow, "owner_id" | "email" | "plan_overrides" | "custom_price_usd" | "contract_note" | "live_links">;

type SearchParams = Promise<{ email?: string; saved?: string; error?: string }>;

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await getSuperAdmin();
  if (!admin) notFound();
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const params = await searchParams;
  const number = new Intl.NumberFormat(LOCALE_TAGS[locale]);
  const date = new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium", timeStyle: "short" });
  const sql = getDatabase();

  const lookupEmail = params.email?.trim().slice(0, 254) ?? "";
  const [inquiries, customAccounts, found] = await Promise.all([
    sql<InquiryRow[]>`select * from public.admin_list_inquiries(${admin.id}::uuid, 100)`,
    sql<CustomAccountRow[]>`select * from public.admin_list_custom_accounts(${admin.id}::uuid)`,
    lookupEmail
      ? sql<AccountRow[]>`select * from public.admin_find_account(${admin.id}::uuid, ${lookupEmail})`
      : Promise.resolve([] as AccountRow[]),
  ]);
  const account = found[0];
  const accountPlan = account ? await getAccountPlan(account.owner_id) : null;
  const overrides = account ? parsePlanOverrides(account.plan_overrides) : {};

  const statusLabels: Record<InquiryStatus, string> = {
    new: tx("New", "새 문의"),
    contacted: tx("Contacted", "연락함"),
    won: tx("Plan set up", "플랜 설정됨"),
    closed: tx("Closed", "종료"),
  };

  return (
    <main className={styles.main}>
      <h1>{tx("Admin", "관리자")}</h1>
      {params.saved ? <p className={styles.notice} role="status">{tx("Saved.", "저장했어요.")}</p> : null}
      {params.error ? <p className={styles.error} role="alert">{tx("Check the values and try again.", "값을 확인하고 다시 시도해 주세요.")}</p> : null}

      <section className={styles.section} aria-labelledby="account-title">
        <h2 id="account-title">{tx("Set a custom plan", "Custom 플랜 설정")}</h2>
        <form className={styles.inline} method="get">
          <label className={styles.field}>
            {tx("Account email", "계정 이메일")}
            <input name="email" type="email" defaultValue={lookupEmail} required maxLength={254} />
          </label>
          <button className={styles.secondary}>{tx("Find", "찾기")}</button>
        </form>
        {lookupEmail && !account ? <p className={styles.muted}>{tx("No account uses this email.", "이 이메일을 쓰는 계정이 없어요.")}</p> : null}
        {account && accountPlan ? (
          <div className={styles.card}>
            <p>
              <strong>{account.email}</strong><br />
              {fill(tx("Current plan: {plan} · {live} links live", "현재 플랜: {plan} · 공개 링크 {live}개"), { plan: accountPlan.limits.name, live: account.live_links })}
              {account.subscription_status ? ` · PayPal ${account.subscription_status}` : ""}
            </p>
            {account.is_super_admin ? <p className={styles.muted}>{tx("Super administrator accounts are not limited.", "슈퍼 관리자 계정은 제한이 없어요.")}</p> : null}
            <form className={styles.grid} action={setCustomPlan}>
              <input type="hidden" name="owner_id" value={account.owner_id} />
              <input type="hidden" name="email" value={account.email} />
              <input type="hidden" name="plan" value="custom" />
              <label className={styles.field}>
                {tx("Live links", "공개 링크 수")}
                <input name="max_links" type="number" min={1} max={100000} required defaultValue={overrides.maxLinks ?? PLANS.pro.maxLinks + 20} />
              </label>
              <label className={styles.field}>
                {tx("Monthly page views", "월 페이지뷰")}
                <input name="monthly_views" type="number" min={0} step={1000} defaultValue={overrides.monthlyViews ?? PLANS.custom.monthlyViews} />
              </label>
              <label className={styles.field}>
                {tx("Monthly price (USD)", "월 요금(USD)")}
                <input name="price_usd" type="number" min={0} step="0.01" defaultValue={account.custom_price_usd ?? ""} />
              </label>
              <label className={`${styles.field} ${styles.full}`}>
                {tx("Contract note", "계약 메모")}
                <textarea name="note" maxLength={2000} defaultValue={account.contract_note ?? ""} />
              </label>
              <button className={styles.primary}>{tx("Save custom plan", "Custom 플랜 저장")}</button>
            </form>
            {account.plan === "custom" ? (
              <form action={setCustomPlan}>
                <input type="hidden" name="owner_id" value={account.owner_id} />
                <input type="hidden" name="email" value={account.email} />
                <input type="hidden" name="plan" value="free" />
                <button className={styles.secondary}>{tx("End custom plan", "Custom 플랜 종료")}</button>
                <p className={styles.muted}>{tx("The account goes back to its PayPal plan, or Free. Extra links become private.", "계정은 PayPal 플랜이나 Free로 돌아가고, 한도를 넘는 링크는 비공개로 바뀌어요.")}</p>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="inquiries-title">
        <h2 id="inquiries-title">{tx("Custom plan inquiries", "Custom 플랜 문의")}</h2>
        {inquiries.length === 0 ? <p className={styles.muted}>{tx("No inquiries yet.", "아직 문의가 없어요.")}</p> : (
          <ul className={styles.list}>
            {inquiries.map((inquiry) => (
              <li key={inquiry.id} className={styles.card} data-status={inquiry.status}>
                <div className={styles.cardHead}>
                  <strong>{inquiry.email}</strong>
                  <span className={styles.badge}>{statusLabels[inquiry.status]}</span>
                </div>
                <p className={styles.muted}>
                  {date.format(new Date(inquiry.created_at))} · {fill(tx("{n} links", "링크 {n}개"), { n: number.format(inquiry.links_needed) })}
                  {inquiry.monthly_views ? ` · ${fill(tx("up to {n} views a month", "월 최대 {n}회 조회"), { n: number.format(inquiry.monthly_views) })}` : ""}
                  {` · ${inquiry.locale}`}
                </p>
                <p className={styles.useCase}>{inquiry.use_case}</p>
                <form className={styles.inline} action={updateInquiry}>
                  <input type="hidden" name="id" value={inquiry.id} />
                  <select name="status" defaultValue={inquiry.status} aria-label={tx("Status", "상태")}>
                    {INQUIRY_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                  </select>
                  <input name="note" defaultValue={inquiry.admin_note ?? ""} maxLength={2000} placeholder={tx("Note", "메모")} aria-label={tx("Note", "메모")} />
                  <button className={styles.secondary}>{tx("Save", "저장")}</button>
                  <Link href={`/admin?email=${encodeURIComponent(inquiry.email)}`}>{tx("Set up plan", "플랜 설정")}</Link>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="custom-title">
        <h2 id="custom-title">{tx("Custom accounts", "Custom 계정")}</h2>
        {customAccounts.length === 0 ? <p className={styles.muted}>{tx("No custom accounts yet.", "아직 Custom 계정이 없어요.")}</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{tx("Email", "이메일")}</th>
                  <th>{tx("Links live", "공개 링크")}</th>
                  <th>{tx("Monthly page views", "월 페이지뷰")}</th>
                  <th>{tx("Monthly price (USD)", "월 요금(USD)")}</th>
                </tr>
              </thead>
              <tbody>
                {customAccounts.map((row) => {
                  const limits = parsePlanOverrides(row.plan_overrides);
                  return (
                    <tr key={row.owner_id}>
                      <td><Link href={`/admin?email=${encodeURIComponent(row.email)}`}>{row.email}</Link></td>
                      <td>{number.format(row.live_links)} / {number.format(limits.maxLinks ?? 0)}</td>
                      <td>{number.format(limits.monthlyViews ?? PLANS.custom.monthlyViews)}</td>
                      <td>{row.custom_price_usd === null ? "—" : `$${row.custom_price_usd}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

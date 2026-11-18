import { getLocale } from "@/lib/i18n-server";
import { affiliateText } from "./copy";
import { copy as introduction } from "@/app/affiliates/copy";
import Link from "next/link";
import { affiliateUser } from "@/lib/affiliates";
import { getDatabase } from "@/lib/database";
import { getSiteUrl } from "@/lib/env";
import { applyAffiliate, recordAffiliatePayout, reviewAffiliate } from "./actions";
import styles from "../dashboard.module.css";

export default async function AffiliatePage() {
  const locale = await getLocale();
  const t = (value: string) => affiliateText(locale, value);
  const intro = introduction[locale];
  const user = await affiliateUser();
  const admin = user.email?.toLowerCase() === "docupia@gmail.com" && Boolean(user.email_confirmed_at);
  const sql = getDatabase();
  const accounts = admin
    ? await sql`select a.*, (select count(*) from public.affiliate_referrals r where r.affiliate_id=a.owner_id) as referrals, (select position from public.affiliate_founders f where f.affiliate_id=a.owner_id) as founder_position from public.affiliates a order by a.created_at desc`
    : await sql`select a.*, (select count(*) from public.affiliate_referrals r where r.affiliate_id=a.owner_id) as referrals, (select position from public.affiliate_founders f where f.affiliate_id=a.owner_id) as founder_position from public.affiliates a where a.owner_id=${user.id}::uuid`;
  const revenue = admin
    ? await sql`select * from public.affiliate_balances order by month desc`
    : await sql`select * from public.affiliate_balances where affiliate_id=${user.id}::uuid order by month desc`;
  const payments = admin
    ? await sql`select * from public.affiliate_settlements order by paid_at desc`
    : await sql`select * from public.affiliate_settlements where affiliate_id=${user.id}::uuid order by paid_at desc`;
  const own = accounts.find(row => row.owner_id === user.id);
  return (
    <main className={styles.main}>
      <Link href="/dashboard">← {t("내 페이지")}</Link>
      <h1>{t("어필리에이트")}</h1>
      <p>{intro[3]} {intro[14]} {intro[12]} {intro[17]}</p>
      <form action={applyAffiliate} className={styles.form}>
        <label className={styles.field}>{t("PayPal 수취 이메일")}
          <input name="email" type="email" required maxLength={254} defaultValue={own?.paypal_email ?? user.email ?? ""} />
        </label>
        <button className={styles.primaryButton}>{own ? t("수취 이메일 저장") : t("어필리에이트 신청")}</button>
      </form>
      {accounts.map(account => (
        <section className={styles.pageCard} key={account.owner_id}>
          <h2>{account.paypal_email}</h2>
          <p>{account.founder_position ? String(account.founder_position) + " · " + t("영구 수당률 30%") : t("수당률 10% · 최초 실적 100명 선정 시 영구 30% 적용")}</p>
          {admin ? (
            <form action={reviewAffiliate}>
              <input type="hidden" name="owner" value={account.owner_id} />
              <button name="status" value="approved">{t("개별 승인")}</button>{" "}
              <button name="status" value="rejected">{t("거절")}</button>
            </form>
          ) : null}
          <p>{t("신청 상태")} · {t(account.status)} / {t("추천 가입")} · {String(account.referrals)}</p>
          <p>{t("추천 링크")} <a href={`${getSiteUrl()}/?ref=${account.code}`}>{`${getSiteUrl()}/?ref=${account.code}`}</a></p>
          <table>
            <thead><tr><th>{t("월")}</th><th>{t("통화")}</th><th>{t("매출")}</th><th>{t("수당")}</th><th>{t("이월 잔액")}</th><th>{t("미지급 잔액")}</th><th>{t("지급 기록")}</th></tr></thead>
            <tbody>{revenue.filter(row => row.affiliate_id === account.owner_id).map(row => {
              const month = new Date(row.month).toISOString().slice(0, 10);
              const paid = payments.find(payment => payment.affiliate_id === account.owner_id &&
                new Date(payment.month).toISOString().slice(0, 10) === month && payment.currency === row.currency);
              return <tr key={month + row.currency}>
                <td>{month.slice(0, 7)}</td><td>{row.currency}</td><td>{String(row.revenue)}</td><td>{String(row.commission)}</td><td>{String(row.opening_balance)}</td><td>{String(row.balance)}</td>
                <td>{paid ? `${paid.amount} · ${paid.payment_reference} · ${paid.paypal_email}` : t("미지급")}</td>
              </tr>;
            })}</tbody>
          </table>
          {admin && account.status === "approved" ? (
            <form action={recordAffiliatePayout} className={styles.form}>
              <input type="hidden" name="owner" value={account.owner_id} />
              <label>{t("정산월의 첫날")}<input type="date" name="month" required /></label>
              <label>{t("통화")}<input name="currency" pattern="[A-Z]{3}" defaultValue="USD" required /></label>
              <p>{t("이전 미지급 수당과 마이너스 이월액을 합산한 잔액으로 지급 완료를 기록합니다. 정산은 월 순서대로 진행해 주세요.")}</p>
              <label>{t("PayPal 거래 번호")}<input name="reference" maxLength={200} required /></label>
              <label><input name="confirmed" value="yes" type="checkbox" required />{t("PayPal 수동 지급을 완료했습니다.")}</label>
              <button className={styles.primaryButton}>{t("지급 완료 기록")}</button>
            </form>
          ) : null}
        </section>
      ))}
    </main>
  );
}

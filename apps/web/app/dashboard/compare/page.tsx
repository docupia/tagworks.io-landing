import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import dashboardStyles from "@/app/dashboard/dashboard.module.css";
import styles from "@/app/pages/[pageId]/analytics/analytics.module.css";
import { LockedPreview } from "@/app/pages/[pageId]/analytics/locked-preview";
import { getAccountPlan } from "@/lib/account-plan";
import { ANALYTICS_RANGE_OPTIONS, parseAnalyticsRange } from "@/lib/analytics";
import { LOCALE_TAGS, text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { statusLabel, type PageStatus } from "@/lib/page-status";
import { loadLinkComparison } from "@/lib/plan-analytics";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "Compare links", "링크 비교") };
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const number = new Intl.NumberFormat(LOCALE_TAGS[locale]);
  const percent = new Intl.NumberFormat(LOCALE_TAGS[locale], { maximumFractionDigits: 1 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const account = await getAccountPlan(user.id);
  const full = account.limits.analytics === "full";
  const range = parseAnalyticsRange((await searchParams).range);
  const rows = full ? await loadLinkComparison(user.id, range).catch(() => null) : [];
  const rangeLabel = (days: number) => days === 0 ? tx("All time", "전체 기간") : tx(`Last ${days} days`, `최근 ${days}일`);

  return (
    <div className={dashboardStyles.shell}>
      <main className={`${dashboardStyles.main} ${styles.main}`}>
        <Link className={dashboardStyles.back} href="/dashboard">← {tx("Back to my pages", "내 페이지로 돌아가기")}</Link>
        <p className={dashboardStyles.eyebrow}>{tx("Analytics", "분석")}</p>
        <h1 className={dashboardStyles.title}>{tx("Compare links", "링크 비교")}</h1>
        <p className={dashboardStyles.subtitle}>{tx("See every link's visits and clicks side by side.", "모든 링크의 방문과 클릭을 한눈에 비교하세요.")}</p>

        {!full ? (
          <section className={styles.panel}>
            <LockedPreview locale={locale} label={tx("Compare links on Pro", "Pro에서 링크 비교하기")} />
          </section>
        ) : (
          <>
            <div className={styles.controlRow}>
              <nav className={styles.rangeTabs} aria-label={tx("Analytics period", "분석 기간")}>
                {ANALYTICS_RANGE_OPTIONS.map((days) => (
                  <Link key={days} className={range === days ? styles.activeRange : undefined} aria-current={range === days ? "page" : undefined}
                    href={`/dashboard/compare?range=${days === 0 ? "all" : days}`}>{rangeLabel(days)}</Link>
                ))}
              </nav>
            </div>
            <section className={styles.panel}>
              {!rows ? (
                <p className={styles.noRows}>{tx("Could not load analytics.", "분석 데이터를 불러오지 못했습니다.")}</p>
              ) : rows.length ? (
                <div className={styles.tableScroll} role="region" aria-label={tx("Compare links", "링크 비교")} tabIndex={0}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">{tx("Link", "링크")}</th>
                        <th scope="col">{tx("Page views", "페이지 조회")}</th>
                        <th scope="col">{tx("Visit sessions", "방문 세션")}</th>
                        <th scope="col">{tx("Outbound click sessions", "외부 클릭 세션")}</th>
                        <th scope="col">{tx("Click rate", "클릭 비율")}</th>
                        <th scope="col">{tx("Total clicks", "전체 클릭")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.pageId}>
                          <th scope="row">
                            <Link href={`/pages/${row.pageId}/analytics?range=${range === 0 ? "all" : range}`}><strong>{row.title}</strong></Link>
                            <span className={styles.sourceBadge}>{statusLabel(row.status as PageStatus, locale)}</span>
                          </th>
                          <td>{number.format(row.pageViews)}</td>
                          <td>{number.format(row.sessions)}</td>
                          <td>{number.format(row.clickSessions)}</td>
                          <td>{percent.format(row.sessions ? (row.clickSessions / row.sessions) * 100 : 0)}%</td>
                          <td>{number.format(row.totalClicks)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.noRows}>{tx("You haven't uploaded a page yet.", "아직 업로드한 페이지가 없어요.")}</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

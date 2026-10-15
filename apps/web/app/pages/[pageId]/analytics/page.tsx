import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import dashboardStyles from "@/app/dashboard/dashboard.module.css";
import { LanguageSwitcher } from "@/app/components/language-switcher";
import {
  ANALYTICS_RANGE_OPTIONS,
  parseAnalyticsRange,
  parsePageAnalytics,
  safeOutboundUrl,
  type AnalyticsDailyRow,
  type AnalyticsFlow,
  type AnalyticsSource,
} from "@/lib/analytics";
import { getPublisherUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { text, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import styles from "./analytics.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "Page analytics", "페이지 분석") };
}

type AnalyticsPageProps = {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<{ range?: string | string[] }>;
};

type PageRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "paused" | "deleted";
  created_at: string;
  published_at: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sourceTypeLabel(type: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    campaign: ["Shared link", "공유 링크"],
    internal: ["TagWorks", "태그웍스"],
    tagworks: ["TagWorks", "태그웍스"],
    utm: ["UTM", "UTM"],
    referrer: ["Referrer", "리퍼러"],
    direct: ["Direct", "직접"],
  };
  const label = labels[type] ?? ["Other", "기타"];
  return locale === "ko" ? label[1] : label[0];
}

function sourceLabel(label: string, type: string, locale: Locale) {
  if (type === "direct" && label === "direct") {
    return text(locale, "Direct / unknown", "직접 방문·출처 불명");
  }
  return label;
}

function rate(part: number, total: number) {
  return total > 0 ? Math.min(100, (part / total) * 100) : 0;
}

function statusLabel(status: PageRow["status"], locale: Locale) {
  if (status === "published") return text(locale, "Published", "게시 중");
  if (status === "paused") return text(locale, "Paused", "게시 중단");
  return text(locale, "Private", "비공개");
}

function FlowRows({
  flows,
  page,
  locale,
}: {
  flows: AnalyticsFlow[];
  page: PageRow;
  locale: Locale;
}) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const number = new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US");
  const largest = Math.max(...flows.map((flow) => flow.sessions), 1);

  return (
    <div className={styles.flowMap}>
      <div className={styles.flowHead} aria-hidden="true">
        <span>{tx("Inbound source", "유입 출처")}</span>
        <span>{tx("Published page", "공개 페이지")}</span>
        <span>{tx("First outbound click", "첫 외부 클릭 결과")}</span>
      </div>
      <ol className={styles.flowRows} aria-label={tx("Session flow from inbound source to first outbound click", "유입 출처에서 첫 외부 클릭까지의 세션 흐름")}>
        {flows.map((flow, index) => {
          const outcome = flow.linkId ? flow.linkLabel : tx("No outbound click", "외부 클릭 미관측");
          const width = Math.max(10, (flow.sessions / largest) * 100);

          return (
            <li className={styles.flowRow} key={`${flow.sourceKey}-${flow.linkId ?? "none"}-${index}`}>
              <div className={styles.sourceNode}>
                <span>{sourceTypeLabel(flow.sourceType, locale)}</span>
                <strong>{sourceLabel(flow.sourceLabel, flow.sourceType, locale)}</strong>
                <small>{number.format(flow.sessions)} {tx("sessions", "개 세션")}</small>
              </div>
              <div className={styles.pageNode}>
                <span className={styles.flowLine} aria-hidden="true">
                  <i style={{ width: `${width}%` }} />
                </span>
                <strong>{page.title}</strong>
                <code>/{page.slug}</code>
              </div>
              <div className={flow.linkId ? styles.resultNode : styles.unobservedNode}>
                <span>{flow.linkId ? tx("First outbound click", "첫 외부 클릭") : tx("Click result", "클릭 결과")}</span>
                <strong>{outcome}</strong>
                <small>{number.format(flow.sessions)} {tx("sessions", "개 세션")}</small>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DailyChart({ rows, locale }: { rows: AnalyticsDailyRow[]; locale: Locale }) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const number = new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US");
  const shortDate = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric",
  });
  const maximum = Math.max(...rows.map((row) => row.sessions), 1);

  return (
    <div className={styles.chartScroll} role="region" aria-label={tx("Daily visit session trend", "날짜별 방문 세션 추이")} tabIndex={0}>
      <div className={styles.dailyChart} style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(30px, 1fr))` }}>
        {rows.map((row) => {
          const height = row.sessions ? Math.max(8, (row.sessions / maximum) * 100) : 0;
          const dateValue = new Date(`${row.date}T00:00:00+09:00`);
          const dateLabel = Number.isNaN(dateValue.getTime()) ? row.date : shortDate.format(dateValue);
          return (
            <div
              className={styles.day}
              key={row.date}
              aria-label={tx(`${row.date}, ${row.sessions} visit sessions, ${row.clickSessions} outbound click sessions`, `${row.date}, 방문 ${row.sessions}개 세션, 외부 클릭 ${row.clickSessions}개 세션`)}
            >
              <div className={styles.barValue}>{row.sessions ? number.format(row.sessions) : ""}</div>
              <div className={styles.barTrack} aria-hidden="true">
                <i style={{ height: `${height}%` }} />
              </div>
              <time dateTime={row.date}>{dateLabel}</time>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SourceTable({ sources, locale }: { sources: AnalyticsSource[]; locale: Locale }) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const number = new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US");
  const percent = new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", { maximumFractionDigits: 1 });
  return (
    <div className={styles.tableScroll} role="region" aria-label={tx("Inbound source details", "유입 출처 상세 표")} tabIndex={0}>
      <table className={styles.table}>
        <caption>{tx("Visits and outbound clicks by inbound source", "유입 출처별 방문과 외부 클릭")}</caption>
        <thead>
          <tr>
            <th scope="col">{tx("Inbound path", "유입 경로")}</th>
            <th scope="col">{tx("Visit sessions", "방문 세션")}</th>
            <th scope="col">{tx("Outbound click sessions", "외부 클릭 세션")}</th>
            <th scope="col">{tx("Click rate", "클릭 비율")}</th>
            <th scope="col">{tx("Total clicks", "전체 클릭")}</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.key}>
              <th scope="row">
                <span className={styles.sourceBadge}>{sourceTypeLabel(source.type, locale)}</span>
                <strong>{sourceLabel(source.label, source.type, locale)}</strong>
              </th>
              <td>{number.format(source.sessions)}</td>
              <td>{number.format(source.clickSessions)}</td>
              <td>{percent.format(rate(source.clickSessions, source.sessions))}%</td>
              <td>{number.format(source.totalClicks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AnalyticsPage({ params, searchParams }: AnalyticsPageProps) {
  const [{ pageId }, query] = await Promise.all([params, searchParams]);
  if (!UUID_PATTERN.test(pageId)) notFound();

  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const number = new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US");
  const percent = new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", { maximumFractionDigits: 1 });
  const updatedDate = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const rangeDays = parseAnalyticsRange(query.range);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pageData, error: pageError } = await supabase
    .from("pages")
    .select("id,slug,title,description,status,created_at,published_at")
    .eq("id", pageId)
    .is("deleted_at", null)
    .maybeSingle();

  if (pageError) throw new Error(tx("Could not load the page.", "페이지 정보를 불러오지 못했습니다."));
  if (!pageData) notFound();
  const page = pageData as PageRow;

  const { data: analyticsData, error: analyticsError } = await supabase.rpc(
    "get_page_analytics",
    { target_page_id: page.id, range_days: rangeDays },
  );
  const analytics = analyticsError ? null : parsePageAnalytics(analyticsData, rangeDays);
  const publicUrl = `${getPublisherUrl()}/p/${page.slug}`;
  const isEmpty = analytics?.summary.sessions === 0;
  const updatedAt = analytics?.updatedAt ? new Date(analytics.updatedAt) : null;
  const validUpdatedAt = updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null;

  return (
    <div className={dashboardStyles.shell}>
      <header className={dashboardStyles.topbar}>
        <Link className={dashboardStyles.brand} href="/">
          <span className={dashboardStyles.brandMark}>T</span>
          TagWorks
        </Link>
        <div className={dashboardStyles.topActions}>
          <LanguageSwitcher locale={locale} />
          <span className={dashboardStyles.account}>{user.email}</span>
          <form action="/auth/signout" method="post">
            <button className={dashboardStyles.signout} type="submit">{tx("Log out", "로그아웃")}</button>
          </form>
        </div>
      </header>

      <main className={`${dashboardStyles.main} ${styles.main}`}>
        <Link className={dashboardStyles.back} href="/dashboard">← {tx("Back to my pages", "내 페이지로 돌아가기")}</Link>

        <section className={styles.hero} aria-labelledby="analytics-title">
          <div>
            <div className={styles.heroMeta}>
              <span className={styles.statusChip}>{statusLabel(page.status, locale)}</span>
              <code>/{page.slug}</code>
            </div>
            <p className={dashboardStyles.eyebrow}>Page analytics</p>
            <h1 className={dashboardStyles.title} id="analytics-title">{page.title}</h1>
            <p className={dashboardStyles.subtitle}>
              {tx("See where visits started and which external links they reached.", "방문이 어디에서 시작되어 어떤 외부 링크로 이어졌는지 확인하세요.")}
            </p>
          </div>
          <a className={dashboardStyles.secondaryButton} href={publicUrl} target="_blank" rel="noreferrer">
            {tx("Open published page", "공개 페이지 열기")}
          </a>
        </section>

        <div className={styles.controlRow}>
          <nav className={styles.rangeTabs} aria-label={tx("Analytics period", "분석 기간")}>
            {ANALYTICS_RANGE_OPTIONS.map((days) => (
              <Link
                className={rangeDays === days ? styles.activeRange : undefined}
                href={`/pages/${page.id}/analytics?range=${days}`}
                aria-current={rangeDays === days ? "page" : undefined}
                key={days}
              >
                {tx(`Last ${days} days`, `최근 ${days}일`)}
              </Link>
            ))}
          </nav>
          <p className={styles.updatedAt}>
            {validUpdatedAt ? tx(`Updated ${updatedDate.format(validUpdatedAt)}`, `${updatedDate.format(validUpdatedAt)} 기준`) : tx("Not calculated yet", "아직 집계 전")}
          </p>
        </div>

        {!analytics ? (
          <section className={styles.errorCard} role="alert">
            <strong>{tx("Could not load analytics.", "분석 데이터를 불러오지 못했습니다.")}</strong>
            <p>{tx("Your published page is unaffected. Please check again shortly.", "공개 페이지에는 영향이 없습니다. 잠시 후 다시 확인해 주세요.")}</p>
          </section>
        ) : (
          <>
            <section className={styles.metricGrid} aria-label={tx(`Key metrics for the last ${analytics.rangeDays} days`, `최근 ${analytics.rangeDays}일 주요 지표`)}>
              {[
                [tx("Page views", "페이지 조회"), analytics.summary.pageViews, tx("Observed views including refreshes", "새로고침을 포함한 관측 횟수")],
                [tx("Visit sessions", "방문 세션"), analytics.summary.sessions, tx("Sessions started in this period", "선택한 기간에 시작된 세션")],
                [tx("Outbound click sessions", "외부 클릭 세션"), analytics.summary.clickSessions, tx("Clicked an external link at least once", "한 번 이상 외부 링크 클릭")],
                [tx("Outbound click rate", "외부 클릭 비율"), `${percent.format(analytics.summary.clickRate)}%`, tx("Click sessions ÷ visit sessions", "클릭 세션 ÷ 방문 세션")],
                [tx("Total outbound clicks", "전체 외부 클릭"), analytics.summary.totalClicks, tx("All clicks including repeats", "반복 클릭을 포함한 총수")],
                [tx("TagWorks-attributed visits", "태그웍스 기여 방문"), analytics.summary.tagworksSessions, tx("Sessions referred inside TagWorks", "태그웍스 내부 경유 세션")],
              ].map(([label, value, hint], index) => (
                <article className={styles.metricCard} key={String(label)}>
                  <span>{label}</span>
                  <strong>{typeof value === "number" ? number.format(value) : value}</strong>
                  <small>{hint}</small>
                  <i className={styles.metricAccent} data-tone={index % 3} aria-hidden="true" />
                </article>
              ))}
            </section>

            {isEmpty ? (
              <section className={styles.empty}>
                <span className={styles.emptyIcon} aria-hidden="true">↗</span>
                <div>
                  <h2>{tx("No visits have been observed yet.", "아직 관측된 방문이 없어요.")}</h2>
                  <p>{tx("Share the public link and visit sessions and first outbound clicks will appear here.", "공개 링크를 공유하면 방문 세션과 첫 외부 클릭 흐름이 이곳에 표시됩니다.")}</p>
                </div>
                <a className={dashboardStyles.primaryButton} href={publicUrl} target="_blank" rel="noreferrer">
                  {tx("Open page to share", "공유할 페이지 열기")}
                </a>
              </section>
            ) : (
              <>
                {analytics.daily.length ? (
                  <section className={styles.panel} aria-labelledby="daily-title">
                    <div className={styles.panelHeading}>
                      <div>
                        <p className={styles.kicker}>Daily sessions</p>
                        <h2 id="daily-title">{tx("Daily visit trend", "일별 방문 추이")}</h2>
                      </div>
                      <p>{tx("Shows sessions started during this period in Korea Standard Time.", "기간에 시작한 방문 세션을 한국 시간 기준으로 표시합니다.")}</p>
                    </div>
                    <DailyChart rows={analytics.daily} locale={locale} />
                  </section>
                ) : null}

                <section className={styles.panel} aria-labelledby="flow-title">
                  <div className={styles.panelHeading}>
                    <div>
                      <p className={styles.kicker}>Session flow</p>
                      <h2 id="flow-title">{tx("Inbound source → page → first outbound click", "유입 출처 → 페이지 → 첫 외부 클릭")}</h2>
                    </div>
                    <p>{tx("Only the first observed outbound click in each session is connected to the flow.", "한 세션에서 처음 관측된 외부 클릭 한 번만 흐름에 연결합니다.")}</p>
                  </div>
                  {analytics.flows.length ? (
                    <>
                      <FlowRows flows={analytics.flows} page={page} locale={locale} />
                      <details className={styles.flowTableDetails}>
                        <summary>{tx("View the same flow as a table", "같은 흐름을 표로 보기")}</summary>
                        <div className={styles.tableScroll} role="region" aria-label={tx("Visit flow details", "방문 흐름 상세 표")} tabIndex={0}>
                          <table className={styles.table}>
                            <caption>{tx("Sessions from inbound source to first outbound click", "유입 출처에서 첫 외부 클릭으로 이어진 세션")}</caption>
                            <thead><tr><th scope="col">{tx("Inbound source", "유입 출처")}</th><th scope="col">{tx("First outbound click", "첫 외부 클릭 결과")}</th><th scope="col">{tx("Sessions", "세션 수")}</th></tr></thead>
                            <tbody>
                              {analytics.flows.map((flow, index) => (
                                <tr key={`${flow.sourceKey}-${flow.linkId ?? "none"}-table-${index}`}>
                                  <th scope="row">{sourceLabel(flow.sourceLabel, flow.sourceType, locale)}</th>
                                  <td>{flow.linkId ? flow.linkLabel : tx("No outbound click", "외부 클릭 미관측")}</td>
                                  <td>{number.format(flow.sessions)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </>
                  ) : (
                    <p className={styles.noRows}>{tx("No visit flow has been recorded.", "집계된 방문 흐름이 없습니다.")}</p>
                  )}
                </section>

                <section className={styles.panel} aria-labelledby="sources-title">
                  <div className={styles.panelHeading}>
                    <div>
                      <p className={styles.kicker}>Inbound paths</p>
                      <h2 id="sources-title">{tx("Inbound paths", "유입 경로")}</h2>
                    </div>
                    <p>{tx("Classifies session sources using share IDs, UTM parameters, and referrer domains.", "공유 식별자, UTM, 리퍼러 도메인 순으로 세션 시작 출처를 분류합니다.")}</p>
                  </div>
                  {analytics.sources.length ? <SourceTable sources={analytics.sources} locale={locale} /> : <p className={styles.noRows}>{tx("No inbound paths have been classified.", "분류된 유입 경로가 없습니다.")}</p>}
                </section>

                <section className={styles.panel} aria-labelledby="outbound-title">
                  <div className={styles.panelHeading}>
                    <div>
                      <p className={styles.kicker}>Outbound links</p>
                      <h2 id="outbound-title">{tx("Outbound links", "외부로 나간 링크")}</h2>
                    </div>
                    <p>{tx("Separates first-click sessions from total clicks, including repeats.", "첫 클릭 세션과 반복 클릭을 포함한 전체 클릭을 구분합니다.")}</p>
                  </div>
                  {analytics.links.length ? (
                    <div className={styles.tableScroll} role="region" aria-label={tx("Outbound link details", "외부 링크 상세 표")} tabIndex={0}>
                      <table className={styles.table}>
                        <caption>{tx("Clicks by outbound link on the published page", "게시된 페이지의 외부 링크별 클릭")}</caption>
                        <thead>
                          <tr>
                            <th scope="col">{tx("Outbound link", "외부 링크")}</th>
                            <th scope="col">{tx("First-click sessions", "첫 클릭 세션")}</th>
                            <th scope="col">{tx("Click sessions", "클릭 세션")}</th>
                            <th scope="col">{tx("Total clicks", "전체 클릭")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.links.map((link) => {
                            const href = safeOutboundUrl(link.url);
                            return (
                              <tr key={link.id}>
                                <th scope="row">
                                  <strong>{link.label}</strong>
                                  {href ? (
                                    <a href={href} target="_blank" rel="noreferrer">{link.domain}</a>
                                  ) : (
                                    <span>{link.domain}</span>
                                  )}
                                </th>
                                <td>{number.format(link.firstClickSessions)}</td>
                                <td>{number.format(link.clickSessions)}</td>
                                <td>{number.format(link.totalClicks)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className={styles.noRows}>{tx("No outbound links were found in the published document.", "게시된 문서에서 분석할 외부 링크를 찾지 못했습니다.")}</p>
                  )}
                </section>

                <aside className={styles.observationNote}>
                  <span aria-hidden="true">i</span>
                  <p>
                    {tx("These are browser-observed visits and clicks. An outbound click does not mean a purchase, inquiry, or booking was completed.", "이 수치는 브라우저에서 관측된 방문과 클릭입니다. 외부 링크 클릭은 구매·문의·예약의 완료를 의미하지 않습니다.")}
                  </p>
                </aside>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

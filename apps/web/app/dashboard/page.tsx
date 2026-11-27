import { publicationUrls } from "@/lib/publication-url";
import { getPublicUsername } from "@/lib/public-username";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "./dashboard.module.css";
import { PageQrCode } from "@/app/components/page-qr-code";
import { getPublisherUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_TAGS, text, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { statusLabel } from "@/lib/page-status";
import { getDatabase } from "@/lib/database";
import { canViewSiteVisits, type SiteVisitSummary } from "@/lib/site-visits";
import { getReconciledAccountPlan } from "@/lib/account-plan";
import { limitMessage } from "@/lib/limit-messages";
import { fill, SELF_SERVE_MAX_LINKS } from "@/lib/plans";
import { setPageLive } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "My pages", "내 페이지") };
}

type PageRow = {
  id: string;
  unpublished_reason: string | null;
  slug: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "paused" | "deleted";
  published_at: string | null;
  created_at: string;
};

type PageAnalyticsSummary = {
  page_id: string;
  sessions: number;
  click_sessions: number;
  total_clicks: number;
};

const displayCount = (value: unknown, locale: Locale) => {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count).toLocaleString(LOCALE_TAGS[locale]) : "0";
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const date = new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Applies any plan change first so the list shows what is live right now.
  const account = await getReconciledAccountPlan(user.id);
  const { limits } = account;

  const [pagesResult, summariesResult] = await Promise.all([
    supabase
      .from("pages")
      .select("id,slug,title,description,status,unpublished_reason,published_at,created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.rpc("get_owner_page_analytics_summary", { range_days: 7 }),
  ]);
  const { data, error } = pagesResult;
  const pages = (data ?? []) as PageRow[];
  const summaryRows = summariesResult.error || !Array.isArray(summariesResult.data)
    ? null
    : (summariesResult.data as PageAnalyticsSummary[]);
  const summaries = summaryRows
    ? new Map(summaryRows.map((summary) => [summary.page_id, summary]))
    : null;
  const publisherUrl = getPublisherUrl();
  const publicUsername = await getPublicUsername(user.id);
  const siteVisits = canViewSiteVisits(user) ? await loadSiteVisits() : undefined;
  const rangeLabel = (days: number) => days === 1 ? tx("Today", "오늘") : days === 7 ? tx("Last 7 days", "최근 7일") : tx("Last 30 days", "최근 30일");

  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <div className={styles.headingRow}>
          <div>
            <h1 className={styles.title}>{tx("My pages", "내 페이지")}</h1>
            <p className={styles.subtitle}>{tx("Manage your uploaded HTML and permanent links in one place.", "업로드한 HTML과 고정 링크를 한곳에서 확인하세요.")}</p>
            <p className={styles.usernameRow}>
              <span>{tx("Public username", "공개 사용자명")}</span>
              <strong>{publicUsername ? `@${publicUsername}` : tx("Not set", "미설정")}</strong>
              <Link href="/dashboard/profile">{publicUsername ? tx("Change", "변경") : tx("Set up", "설정")}</Link>
            </p>
          </div>
          <Link className={styles.primaryButton} href="/pages/new">{tx("Upload new HTML", "새 HTML 업로드")}</Link>
        </div>

        <section className={styles.planStrip} aria-label={tx("Plan usage", "플랜 사용량")}>
          <div>
            <strong>{account.superAdmin
              ? fill(tx("{plan} · {live} links live", "{plan} · 공개 링크 {live}개"), { plan: limits.name, live: account.liveLinks })
              : fill(tx("{plan} · {live} of {max} links live", "{plan} · 공개 링크 {max}개 중 {live}개"), { plan: limits.name, live: account.liveLinks, max: limits.maxLinks })}</strong>
            {account.superAdmin ? null : (
              <div className={styles.usageMeter} data-full={account.liveLinks >= limits.maxLinks ? "" : undefined} aria-hidden="true">
                <i style={{ width: `${Math.min(100, (account.liveLinks / Math.max(1, limits.maxLinks)) * 100)}%` }} />
              </div>
            )}
            <span>{tx("Edits are unlimited. Make a link private to free a slot.", "수정은 무제한이에요. 링크를 비공개로 바꾸면 자리가 돌아와요.")}</span>
          </div>
          <Link href={limits.maxLinks >= SELF_SERVE_MAX_LINKS && account.liveLinks >= limits.maxLinks ? "/contact" : "/billing"}>
            {limits.maxLinks >= SELF_SERVE_MAX_LINKS && account.liveLinks >= limits.maxLinks ? tx("Need more links?", "링크가 더 필요하세요?") : tx("View plan", "플랜 보기")}
          </Link>
        </section>

        {notice === "link_limit" ? (
          <p className={styles.notice} role="status">{limitMessage(locale, limits.maxLinks >= SELF_SERVE_MAX_LINKS ? "custom_needed" : "link_limit", { n: limits.maxLinks, plan: limits.name })}{" "}
            <Link href={limits.maxLinks >= SELF_SERVE_MAX_LINKS ? "/contact" : "/billing"}>{limits.maxLinks >= SELF_SERVE_MAX_LINKS ? tx("Contact us", "문의하기") : tx("See plans", "플랜 보기")}</Link></p>
        ) : notice === "unpublished" ? (
          <p className={styles.notice} role="status">{tx("The link is now private. Its URL shows a closed notice until you publish it again.", "링크를 비공개로 바꿨어요. 다시 공개할 때까지 이 주소에는 닫힘 안내가 보여요.")}</p>
        ) : notice === "published" ? (
          <p className={styles.notice} role="status">{tx("The link is live again at the same URL.", "같은 주소로 다시 공개했어요.")}</p>
        ) : null}
        {pages.some((page) => page.status === "paused" && page.unpublished_reason === "downgrade") ? (
          <p className={styles.notice} role="status">{fill(tx("Some links were made private because your plan allows {n} live links. They come back at the same URL when you upgrade.", "현재 플랜의 공개 링크 한도({n}개)를 넘는 링크는 비공개로 바뀌었어요. 업그레이드하면 같은 주소로 복구돼요."), { n: limits.maxLinks })}{" "}
            <Link href="/billing">{tx("See plans", "플랜 보기")}</Link></p>
        ) : null}

        {siteVisits !== undefined ? (
          <section className={styles.siteVisits} aria-labelledby="site-visits-title">
            <h2 id="site-visits-title">{tx("tagworks.io unique visitors", "tagworks.io 순방문자")}</h2>
            {siteVisits ? (
              <div className={styles.siteVisitGrid}>
                {siteVisits.map((row) => (
                  <dl key={row.range_days}>
                    <dt>{rangeLabel(Number(row.range_days))}</dt>
                    <dd>{displayCount(row.visitors, locale)}</dd>
                  </dl>
                ))}
              </div>
            ) : (
              <p className={styles.error}>{tx("We could not load visitor counts. Please try again shortly.", "방문자 수를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")}</p>
            )}
            <p className={styles.statsCaption}>{tx("Unique visitors, counted once per browser (Korea time). Only you can see this.", "브라우저 기준 순방문자 수입니다(한국 시간 기준). 이 정보는 나만 볼 수 있습니다.")}</p>
          </section>
        ) : null}

        {error ? (
          <p className={styles.error}>{tx("We could not load your pages. Please try again shortly.", "페이지 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")}</p>
        ) : pages.length ? (
          <div className={styles.grid}>
            {pages.map((page) => {
              const { publicUrl: href } = publicationUrls(page.slug, publisherUrl, process.env.TAGWORKS_PUBLISHING_DOMAIN, publicUsername);
              const published = page.status === "published";
              const summary = summaries?.get(page.id) ?? (summaries ? {
                page_id: page.id,
                sessions: 0,
                click_sessions: 0,
                total_clicks: 0,
              } : null);
              return (
                <article className={styles.pageCard} key={page.id}>
                  <div className={styles.pageDetails}>
                    <div className={styles.meta}>
                      <span className={styles.badge} data-status={page.status}>
                        {statusLabel(page.status, locale, page.unpublished_reason)}
                      </span>
                      <span>{tx(`Created ${date.format(new Date(page.created_at))}`, `${date.format(new Date(page.created_at))} 생성`)}</span>
                    </div>
                    <h2 className={styles.pageTitle}>
                      <Link href={`/pages/${page.id}/analytics`}>{page.title}</Link>
                    </h2>
                    {page.description ? <p className={styles.description}>{page.description}</p> : null}
                    <dl className={styles.miniAnalytics} aria-label={tx("Analytics summary for the last 7 days", "최근 7일 분석 요약")}>
                      <div><dt>{tx("Visit sessions", "방문 세션")}</dt><dd>{summary ? displayCount(summary.sessions, locale) : "—"}</dd></div>
                      <div><dt>{tx("Outbound click sessions", "외부 클릭 세션")}</dt><dd>{summary ? displayCount(summary.click_sessions, locale) : "—"}</dd></div>
                      <div><dt>{tx("Total outbound clicks", "전체 외부 클릭")}</dt><dd>{summary ? displayCount(summary.total_clicks, locale) : "—"}</dd></div>
                    </dl>
                    <p className={styles.statsCaption}>{tx("Last 7 days", "최근 7일")}</p>
                  </div>
                  <div className={styles.cardActions}>
                    <Link className={styles.primaryButton} href={`/pages/${page.id}/analytics`}>
                      {tx("View analytics", "분석 보기")}
                    </Link>
                    {published ? (
                      <a className={styles.secondaryButton} href={href} target="_blank" rel="noreferrer">
                        {tx("Open link", "링크 열기")}
                      </a>
                    ) : null}
                    {!published && page.status === "paused" ? (
                      <form action={setPageLive} className={styles.moreForm}>
                        <input type="hidden" name="pageId" value={page.id} />
                        <input type="hidden" name="live" value="1" />
                        <button className={styles.secondaryButton} type="submit">{tx("Publish again", "다시 공개")}</button>
                      </form>
                    ) : null}
                    <details className={styles.more}>
                      <summary aria-label={tx("More actions", "더보기")}><span aria-hidden="true">⋯</span></summary>
                      <div className={styles.morePanel}>
                        <Link className={styles.moreItem} href={`/pages/new?edit=${page.id}`}>
                          {tx("Edit page", "페이지 수정")}
                        </Link>
                        {published ? (
                          <form action={setPageLive} className={styles.moreForm}>
                            <input type="hidden" name="pageId" value={page.id} />
                            <input type="hidden" name="live" value="0" />
                            <button className={styles.moreItem} type="submit">{tx("Make private", "비공개로 전환")}</button>
                          </form>
                        ) : null}
                        {published ? (
                          <PageQrCode
                            compact
                            fileName={`tagworks-${page.slug}-qr.png`}
                            title={page.title}
                            url={href}
                            locale={locale}
                          />
                        ) : null}
                      </div>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <section className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">↗</span>
            <h2>{tx("You haven't uploaded a page yet.", "아직 업로드한 페이지가 없어요.")}</h2>
            <p>{tx("Upload your first HTML file to create a permanent link you can share.", "첫 HTML 파일을 올리면 공유 가능한 고정 링크가 바로 만들어집니다.")}</p>
            <Link className={styles.primaryButton} href="/pages/new">{tx("Create first page", "첫 페이지 만들기")}</Link>
          </section>
        )}
      </main>
    </div>
  );
}

async function loadSiteVisits(): Promise<SiteVisitSummary[] | null> {
  try {
    return await getDatabase()<SiteVisitSummary[]>`select * from public.get_site_visit_summary()`;
  } catch (error) {
    console.error("Could not load site visits", error);
    return null;
  }
}

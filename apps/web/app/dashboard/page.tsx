import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "./dashboard.module.css";
import { getPublisherUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "내 페이지" };

type PageRow = {
  id: string;
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

const date = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const displayCount = (value: unknown) => {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count).toLocaleString("ko-KR") : "0";
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [pagesResult, summariesResult] = await Promise.all([
    supabase
      .from("pages")
      .select("id,slug,title,description,status,published_at,created_at")
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

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>T</span>
          TagWorks
        </Link>
        <div className={styles.topActions}>
          <span className={styles.account}>{user.email}</span>
          <form action="/auth/signout" method="post">
            <button className={styles.signout} type="submit">로그아웃</button>
          </form>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.headingRow}>
          <div>
            <p className={styles.eyebrow}>My pages</p>
            <h1 className={styles.title}>내 페이지</h1>
            <p className={styles.subtitle}>업로드한 HTML과 고정 링크를 한곳에서 확인하세요.</p>
          </div>
          <Link className={styles.primaryButton} href="/pages/new">새 HTML 업로드</Link>
        </div>

        {error ? (
          <p className={styles.error}>페이지 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        ) : pages.length ? (
          <div className={styles.grid}>
            {pages.map((page) => {
              const href = `${publisherUrl}/p/${page.slug}`;
              const summary = summaries?.get(page.id) ?? (summaries ? {
                page_id: page.id,
                sessions: 0,
                click_sessions: 0,
                total_clicks: 0,
              } : null);
              return (
                <article className={styles.pageCard} key={page.id}>
                  <div className={styles.pageDetails}>
                    <h2 className={styles.pageTitle}>{page.title}</h2>
                    {page.description ? <p className={styles.description}>{page.description}</p> : null}
                    <div className={styles.meta}>
                      <span className={styles.badge}>
                        {page.status === "published" ? "게시 중" : "비공개"}
                      </span>
                      <span>{date.format(new Date(page.created_at))} 생성</span>
                      <span>/{page.slug}</span>
                    </div>
                    <div className={styles.miniAnalytics} aria-label="최근 7일 분석 요약">
                      <span>최근 7일</span>
                      {summary ? (
                        <>
                          <strong>{displayCount(summary.sessions)} 방문</strong>
                          <i aria-hidden="true" />
                          <strong>{displayCount(summary.click_sessions)} 외부 클릭 세션</strong>
                          <i aria-hidden="true" />
                          <strong>{displayCount(summary.total_clicks)}회 클릭</strong>
                        </>
                      ) : (
                        <strong>통계 —</strong>
                      )}
                    </div>
                  </div>
                  <div className={styles.cardActions}>
                    <Link className={styles.analyticsButton} href={`/pages/${page.id}/analytics`}>
                      분석 보기
                    </Link>
                    {page.status === "published" ? (
                      <a className={styles.secondaryButton} href={href} target="_blank" rel="noreferrer">
                        고정 링크 열기
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <section className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">↗</span>
            <h2>아직 업로드한 페이지가 없어요.</h2>
            <p>첫 HTML 파일을 올리면 공유 가능한 고정 링크가 바로 만들어집니다.</p>
            <Link className={styles.primaryButton} href="/pages/new">첫 페이지 만들기</Link>
          </section>
        )}
      </main>
    </div>
  );
}

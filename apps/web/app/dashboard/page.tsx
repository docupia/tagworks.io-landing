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

const date = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("pages")
    .select("id,slug,title,description,status,published_at,created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const pages = (data ?? []) as PageRow[];
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
              return (
                <article className={styles.pageCard} key={page.id}>
                  <div>
                    <h2 className={styles.pageTitle}>{page.title}</h2>
                    {page.description ? <p className={styles.description}>{page.description}</p> : null}
                    <div className={styles.meta}>
                      <span className={styles.badge}>
                        {page.status === "published" ? "게시 중" : "비공개"}
                      </span>
                      <span>{date.format(new Date(page.created_at))} 생성</span>
                      <span>/{page.slug}</span>
                    </div>
                  </div>
                  {page.status === "published" ? (
                    <a className={styles.secondaryButton} href={href} target="_blank" rel="noreferrer">
                      고정 링크 열기
                    </a>
                  ) : null}
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

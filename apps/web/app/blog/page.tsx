import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { BLOG_INDEX, blogIndexJsonLd, blogUrl, jsonLd } from "@/lib/blog";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { BlogCta } from "./blog-cta";
import home from "../home.module.css";
import styles from "./blog.module.css";

export const metadata: Metadata = {
  title: { absolute: BLOG_INDEX.title },
  description: BLOG_INDEX.description,
  alternates: { canonical: blogUrl() },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "TagWorks", url: blogUrl(), title: BLOG_INDEX.title, description: BLOG_INDEX.description },
  twitter: { card: "summary_large_image", title: BLOG_INDEX.title, description: BLOG_INDEX.description },
};

export default async function BlogIndexPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  return (
    <div className={home.page}>
      <a className="skip-link" href="#main">{tx("Skip to content", "본문으로 바로가기")}</a>
      <SiteHeader locale={locale} member={user ? user.email ?? "Member" : undefined} current="blog" />
      <main id="main" className={styles.blog}>
        <div className={styles.wrap}>
          <nav className={styles.crumbs} aria-label={tx("Breadcrumb", "이동 경로")}>
            <Link prefetch={false} href="/">{tx("Home", "홈")}</Link> / <span>{tx("Blog", "블로그")}</span>
          </nav>
          <span className={styles.eyebrow}>{tx("Guides", "가이드")}</span>
          <h1>{tx("Publish AI-made pages, step by step", "AI로 만든 페이지, 단계별로 공개하기")}</h1>
          <p className={styles.lead}>
            {tx(
              "Practical guides for turning pages made with Claude, ChatGPT, Gemini and coding agents into permanent links you can share and track.",
              "Claude, ChatGPT, Gemini, 코딩 에이전트로 만든 페이지를 공유하고 분석할 수 있는 고정 링크로 바꾸는 실전 가이드예요.",
            )}
          </p>
          <div className={styles.grid} lang="en">
            {BLOG_POSTS.map((post) => (
              <Link prefetch={false} key={post.slug} className={styles.card} href={`/blog/${post.slug}`}>
                <span className={styles.tag}>{post.tag}</span>
                <h2>{post.short}</h2>
                <p>{post.card}</p>
                <span className={styles.more} lang={locale}>{tx("Read guide", "가이드 읽기")} &rarr;</span>
              </Link>
            ))}
          </div>
          <BlogCta locale={locale} />
        </div>
      </main>
      <SiteFooter locale={locale} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(blogIndexJsonLd()) }} />
    </div>
  );
}

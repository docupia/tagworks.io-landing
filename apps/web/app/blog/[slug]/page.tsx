import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { BLOG_POSTS, getBlogPost } from "@/lib/blog-posts";
import { blogPostJsonLd, blogUrl, jsonLd, relatedPosts } from "@/lib/blog";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { BlogCta } from "../blog-cta";
import home from "../../home.module.css";
import styles from "../blog.module.css";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getBlogPost((await params).slug);
  if (!post) return {};
  const url = blogUrl(post.slug);
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      siteName: "TagWorks",
      url,
      title: post.title,
      description: post.description,
      publishedTime: post.published,
      modifiedTime: post.updated,
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.description },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const post = getBlogPost((await params).slug);
  if (!post) notFound();
  const locale = await getLocale();
  const user = await getCurrentUser();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  return (
    <div className={home.page}>
      <a className="skip-link" href="#main">{tx("Skip to content", "본문으로 바로가기")}</a>
      <SiteHeader locale={locale} member={user ? user.email ?? "Member" : undefined} current="blog" />
      <main id="main" className={styles.blog}>
        <article className={styles.narrow}>
          <nav className={styles.crumbs} aria-label={tx("Breadcrumb", "이동 경로")}>
            <Link prefetch={false} href="/">{tx("Home", "홈")}</Link> / <Link prefetch={false} href="/blog">{tx("Blog", "블로그")}</Link> / <span lang="en">{post.short}</span>
          </nav>
          <span className={styles.eyebrow}>{post.tag} · {tx("Guide", "가이드")}</span>
          <div lang="en">
            <h1>{post.h1}</h1>
            <p className={styles.lead}>{post.lead}</p>
          </div>
          <p className={styles.meta}>
            <time dateTime={post.updated}>{post.updated}</time> · {post.readMinutes} {tx("min read", "분 분량")}
            {locale !== "en" ? <> · {tx("This guide is in English.", "이 가이드는 영어로 작성됐어요.")}</> : null}
          </p>
          <div className={styles.prose} lang="en" dangerouslySetInnerHTML={{ __html: post.body }} />
          {post.faq.length ? (
            <section className={styles.faq} lang="en" aria-labelledby="faq-title">
              <h2 id="faq-title">FAQ</h2>
              {post.faq.map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </section>
          ) : null}
          <BlogCta locale={locale} />
          <section className={styles.related} aria-labelledby="related-title">
            <h2 id="related-title">{tx("More guides", "다른 가이드")}</h2>
            <div className={styles.grid}>
              {relatedPosts(post).map((item) => (
                <Link prefetch={false} key={item.slug} className={styles.card} href={`/blog/${item.slug}`}>
                  <span className={styles.tag}>{item.tag}</span>
                  <h3 lang="en">{item.short}</h3>
                  <span className={styles.more}>{tx("Read guide", "가이드 읽기")} &rarr;</span>
                </Link>
              ))}
            </div>
          </section>
        </article>
      </main>
      <SiteFooter locale={locale} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(blogPostJsonLd(post)) }} />
    </div>
  );
}

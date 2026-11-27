import Link from "next/link";
import { LanguageSwitcher } from "@/app/components/language-switcher";
import { text, type Locale } from "@/lib/i18n";
import { BrandMark } from "./brand-mark";
import styles from "./site-chrome.module.css";

type Section = "blog" | "affiliates";

/** Header and footer shared by the home page, blog and other public marketing pages. */
export function SiteHeader({ locale, member, current }: { locale: Locale; member?: string; current?: Section }) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const currentProps = (section: Section) => (current === section ? { "aria-current": "page" as const } : {});
  const links = (
    <>
      <Link prefetch={false} href="/#how">{tx("How it works", "작동 방식")}</Link>
      <Link prefetch={false} href="/#pricing">{tx("Pricing", "요금제")}</Link>
      <Link prefetch={false} href="/blog" {...currentProps("blog")}>{tx("Blog", "블로그")}</Link>
      <Link prefetch={false} href="/affiliates" {...currentProps("affiliates")}>{tx("Affiliate", "어필리에이트")}</Link>
    </>
  );
  const account = member
    ? <Link prefetch={false} href="/dashboard" title={member}>{tx("My pages", "내 페이지")}</Link>
    : <Link prefetch={false} href="/login">{tx("Log in", "로그인")}</Link>;
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link prefetch={false} className={styles.brand} href="/" aria-label={tx("TagWorks home", "TagWorks 홈")}>
          <BrandMark className={styles.mark} />
          <span>TagWorks</span>
        </Link>
        <nav className={styles.nav} aria-label={tx("Main navigation", "주요 메뉴")}>
          {links}
          {account}
        </nav>
        <div className={styles.actions}>
          {member ? null : (
            <Link prefetch={false} className={styles.start} href="/signup">{tx("Start free", "무료로 시작하기")}</Link>
          )}
          <details className={styles.menu}>
            <summary>{tx("Menu", "메뉴")}</summary>
            <div className={styles.menuPanel}>
              {links}
              {account}
              <LanguageSwitcher locale={locale} />
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ locale }: { locale: Locale }) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <span>© {new Date().getFullYear()} TagWorks</span>
        <nav className={styles.footerLinks} aria-label={tx("Footer", "하단 메뉴")}>
          <Link prefetch={false} href="/#how">{tx("How it works", "작동 방식")}</Link>
          <Link prefetch={false} href="/#pricing">{tx("Pricing", "요금제")}</Link>
          <Link prefetch={false} href="/blog">{tx("Blog", "블로그")}</Link>
          <Link prefetch={false} href="/affiliates">{tx("Affiliate", "어필리에이트")}</Link>
          <Link prefetch={false} href="/#api-mcp">API &amp; MCP</Link>
          <Link prefetch={false} href="/#faq">FAQ</Link>
          <Link prefetch={false} href="/contact">{tx("Contact", "문의")}</Link>
        </nav>
      </div>
      <div className={styles.footerMeta}>
        <LanguageSwitcher locale={locale} />
        <a href="https://peerpush.com/p/tagworks" target="_blank" rel="noopener" className={styles.peerpush}>
          <img src="https://peerpush.com/p/tagworks/badge.png" alt="TagWorks on PeerPush" width={230} height={65} loading="lazy" />
        </a>
      </div>
    </footer>
  );
}

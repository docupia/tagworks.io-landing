import Link from "next/link";
import { LanguageSwitcher } from "@/app/components/language-switcher";
import { text, type Locale } from "@/lib/i18n";
import { BrandMark } from "./brand-mark";
import styles from "./site-chrome.module.css";

/** Header and footer shared by the home page and other public marketing pages. */
export function SiteHeader({ locale, member }: { locale: Locale; member?: string }) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const links = (
    <>
      <Link prefetch={false} href="/#how">{tx("How it works", "작동 방식")}</Link>
      <Link prefetch={false} href="/#pricing">{tx("Pricing", "요금제")}</Link>
      <Link prefetch={false} href="/#api-mcp">API &amp; MCP</Link>
    </>
  );
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link prefetch={false} className={styles.brand} href="/" aria-label={tx("TagWorks home", "TagWorks 홈")}>
          <BrandMark className={styles.mark} />
          <span>TagWorks</span>
        </Link>
        <nav className={styles.nav} aria-label={tx("Main navigation", "주요 메뉴")}>
          {links}
        </nav>
        <div className={styles.actions}>
          <div className={styles.language}><LanguageSwitcher locale={locale} /></div>
          {member ? (
            <Link prefetch={false} className={styles.login} href="/dashboard" title={member}>{tx("My pages", "내 페이지")}</Link>
          ) : (
            <>
              <Link prefetch={false} className={styles.login} href="/login">{tx("Log in", "로그인")}</Link>
              <Link prefetch={false} className={styles.start} href="/signup">{tx("Start free", "무료로 시작하기")}</Link>
            </>
          )}
          <details className={styles.menu}>
            <summary>{tx("Menu", "메뉴")}</summary>
            <div className={styles.menuPanel}>
              {links}
              <Link prefetch={false} href={member ? "/dashboard" : "/login"}>{member ? tx("My pages", "내 페이지") : tx("Log in", "로그인")}</Link>
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
        <Link prefetch={false} className={styles.brand} href="/" aria-label={tx("TagWorks home", "TagWorks 홈")}>
          <BrandMark className={styles.mark} />
          <span>TagWorks</span>
        </Link>
        <nav className={styles.footerLinks} aria-label={tx("Footer", "하단 메뉴")}>
          <Link prefetch={false} href="/#how">{tx("How it works", "작동 방식")}</Link>
          <Link prefetch={false} href="/#pricing">{tx("Pricing", "요금제")}</Link>
          <Link prefetch={false} href="/#api-mcp">API &amp; MCP</Link>
          <Link prefetch={false} href="/#faq">FAQ</Link>
          <Link prefetch={false} href="/affiliates">{tx("Affiliate (earn 30%)", "어필리에이트 (30% 수익)")}</Link>
          <Link prefetch={false} href="/contact">{tx("Contact", "문의")}</Link>
        </nav>
        <div className={styles.footerMeta}>
          <LanguageSwitcher locale={locale} />
          <span>© {new Date().getFullYear()} TagWorks</span>
          <a href="https://peerpush.com/p/tagworks" target="_blank" rel="noopener" className={styles.peerpush}>
            <img src="https://peerpush.com/p/tagworks/badge.png" alt="TagWorks on PeerPush" width={230} height={65} loading="lazy" />
          </a>
        </div>
      </div>
    </footer>
  );
}

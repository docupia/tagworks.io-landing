import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { BrandMark } from "@/components/marketing/brand-mark";
import { LanguageSwitcher } from "./language-switcher";
import { MemberAccountMenu, MemberNav } from "./member-nav";
import styles from "./member-shell.module.css";

export async function MemberShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const email = user.email ?? "";

  return <div className={styles.shell}>
    <header className={styles.topbar}>
      <Link className={`brand ${styles.brand}`} href="/dashboard" aria-label={tx("My pages", "내 페이지")}>
        <BrandMark /><span>TagWorks</span>
      </Link>
      <MemberNav
        label={tx("Main navigation", "주요 메뉴")}
        items={[
          { href: "/dashboard", label: tx("My pages", "내 페이지"), icon: "pages" },
          { href: "/dashboard/api-keys", label: "API & MCP", icon: "api" },
          { href: "/billing", label: tx("Plans", "플랜"), icon: "plans" },
          { href: "/dashboard/affiliates", label: tx("Affiliate", "어필리에이트"), icon: "affiliate" },
        ]}
      />
      <MemberAccountMenu label={tx("Account menu", "계정 메뉴")} initial={(email[0] ?? "?").toUpperCase()}>
        <span className={styles.email}>{email}</span>
        <Link className={styles.menuItem} href="/dashboard/profile">{tx("Public username", "공개 사용자명")}</Link>
        <LanguageSwitcher locale={locale} />
        <form action="/auth/signout" method="post">
          <button className={styles.menuItem}>{tx("Log out", "로그아웃")}</button>
        </form>
      </MemberAccountMenu>
    </header>
    <div className={styles.content}>{children}</div>
  </div>;
}

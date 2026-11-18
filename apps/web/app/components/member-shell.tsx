import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";
import { BrandMark } from "@/components/marketing/brand-mark";
import { LanguageSwitcher } from "./language-switcher";
import styles from "./member-shell.module.css";

export async function MemberShell({ children }: { children: ReactNode }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect("/login");
  const locale = await getLocale();
  const labels = {
    en: ["My pages", "API & MCP", "Plans", "Affiliate", "Log out"],
    ko: ["내 페이지", "API & MCP", "플랜", "어필리에이트", "로그아웃"],
    ja: ["マイページ", "API & MCP", "プラン", "アフィリエイト", "ログアウト"],
    es: ["Mis páginas", "API & MCP", "Planes", "Afiliados", "Cerrar sesión"],
    de: ["Meine Seiten", "API & MCP", "Tarife", "Partnerprogramm", "Abmelden"],
    zh: ["我的页面", "API & MCP", "套餐", "推广伙伴", "退出登录"],
  }[locale];
  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link className="brand" href="/"><BrandMark /><span>TagWorks</span></Link>
      <span className={styles.email}>{user.email}</span>
      <nav aria-label={labels[0]}>
        {["/dashboard", "/dashboard/api-keys", "/billing", "/dashboard/affiliates"].map((href, i) =>
          <Link key={href} href={href}>{labels[i]}</Link>)}
        <form action="/auth/signout" method="post"><button>{labels[4]}</button></form>
      </nav>
      <LanguageSwitcher locale={locale} />
    </aside>
    <div className={styles.content}>{children}</div>
  </div>;
}

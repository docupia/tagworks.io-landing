import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/app/auth-actions";
import { LanguageSwitcher } from "@/app/components/language-switcher";
import styles from "@/app/auth.module.css";
import { AuthSubmitButton } from "@/components/auth-submit-button";
import { createClient } from "@/lib/supabase/server";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "Log in", "로그인") };
}

type SearchParams = Promise<{ error?: string; message?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

  const params = await searchParams;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.authTopline}>
        <Link className={styles.brand} href="/" aria-label={tx("TagWorks home", "TagWorks 홈")}>
          <span className={styles.brandMark}>T</span>
          TagWorks
        </Link>
        <LanguageSwitcher locale={locale} />
        </div>
        <p className={styles.eyebrow}>{tx("Welcome back", "다시 오신 것을 환영해요")}</p>
        <h1 className={styles.title}>{tx("Welcome back.", "다시 만나 반가워요.")}</h1>
        <p className={styles.description}>{tx("Log in to manage your uploaded pages and permanent links.", "로그인하고 업로드한 페이지와 고정 링크를 관리하세요.")}</p>
        {params.message ? <p className={styles.notice}>{params.message}</p> : null}
        {params.error ? <p className={styles.error}>{params.error}</p> : null}
        <form className={styles.form} action={signIn}>
          <label className={styles.field}>
            {tx("Email", "이메일")}
            <input name="email" type="email" autoComplete="email" required maxLength={254} />
          </label>
          <label className={styles.field}>
            {tx("Password", "비밀번호")}
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <AuthSubmitButton pendingLabel={tx("Logging in…", "처리 중…")}>{tx("Log in", "로그인")}</AuthSubmitButton>
        </form>
        <p className={styles.switch}>
          {tx("New to TagWorks?", "처음이신가요?")} <Link href="/signup">{tx("Start free", "무료로 시작하기")}</Link>
        </p>
      </section>
    </main>
  );
}

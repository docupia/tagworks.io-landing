import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "@/app/auth-actions";
import { LanguageSwitcher } from "@/app/components/language-switcher";
import styles from "@/app/auth.module.css";
import { AuthSubmitButton } from "@/components/auth-submit-button";
import { createClient } from "@/lib/supabase/server";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "Sign up", "회원가입") };
}

type SearchParams = Promise<{ error?: string }>;

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
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
        <p className={styles.eyebrow}>{tx("Create account", "계정 만들기")}</p>
        <h1 className={styles.title}>{tx("Ready to publish your first page?", "첫 페이지를 올려볼까요?")}</h1>
        <p className={styles.description}>{tx("Create an account, upload HTML, and get a permanent link right away.", "계정을 만들고 HTML을 업로드하면 바로 고정 링크가 생깁니다.")}</p>
        {params.error ? <p className={styles.error}>{params.error}</p> : null}
        <form className={styles.form} action={signUp}>
          <label className={styles.field}>
            {tx("Email", "이메일")}
            <input name="email" type="email" autoComplete="email" required maxLength={254} />
          </label>
          <label className={styles.field}>
            {tx("Password", "비밀번호")}
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label className={styles.field}>
            {tx("Confirm password", "비밀번호 확인")}
            <input name="passwordConfirm" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <AuthSubmitButton pendingLabel={tx("Creating account…", "처리 중…")}>{tx("Create free account", "무료 계정 만들기")}</AuthSubmitButton>
        </form>
        <p className={styles.switch}>
          {tx("Already have an account?", "이미 계정이 있나요?")} <Link href="/login">{tx("Log in", "로그인")}</Link>
        </p>
      </section>
    </main>
  );
}

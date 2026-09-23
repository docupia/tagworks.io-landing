import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "@/app/auth-actions";
import styles from "@/app/auth.module.css";
import { AuthSubmitButton } from "@/components/auth-submit-button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "회원가입" };

type SearchParams = Promise<{ error?: string }>;

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

  const params = await searchParams;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Link className={styles.brand} href="/" aria-label="TagWorks 홈">
          <span className={styles.brandMark}>T</span>
          TagWorks
        </Link>
        <p className={styles.eyebrow}>Create account</p>
        <h1 className={styles.title}>첫 페이지를 올려볼까요?</h1>
        <p className={styles.description}>계정을 만들고 HTML을 업로드하면 바로 고정 링크가 생깁니다.</p>
        {params.error ? <p className={styles.error}>{params.error}</p> : null}
        <form className={styles.form} action={signUp}>
          <label className={styles.field}>
            이메일
            <input name="email" type="email" autoComplete="email" required maxLength={254} />
          </label>
          <label className={styles.field}>
            비밀번호
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label className={styles.field}>
            비밀번호 확인
            <input name="passwordConfirm" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <AuthSubmitButton>무료 계정 만들기</AuthSubmitButton>
        </form>
        <p className={styles.switch}>
          이미 계정이 있나요? <Link href="/login">로그인</Link>
        </p>
      </section>
    </main>
  );
}

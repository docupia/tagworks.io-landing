import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/app/auth-actions";
import styles from "@/app/auth.module.css";
import { AuthSubmitButton } from "@/components/auth-submit-button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "로그인" };

type SearchParams = Promise<{ error?: string; message?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
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
        <p className={styles.eyebrow}>Welcome back</p>
        <h1 className={styles.title}>다시 만나 반가워요.</h1>
        <p className={styles.description}>로그인하고 업로드한 페이지와 고정 링크를 관리하세요.</p>
        {params.message ? <p className={styles.notice}>{params.message}</p> : null}
        {params.error ? <p className={styles.error}>{params.error}</p> : null}
        <form className={styles.form} action={signIn}>
          <label className={styles.field}>
            이메일
            <input name="email" type="email" autoComplete="email" required maxLength={254} />
          </label>
          <label className={styles.field}>
            비밀번호
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <AuthSubmitButton>로그인</AuthSubmitButton>
        </form>
        <p className={styles.switch}>
          처음이신가요? <Link href="/signup">무료로 시작하기</Link>
        </p>
      </section>
    </main>
  );
}

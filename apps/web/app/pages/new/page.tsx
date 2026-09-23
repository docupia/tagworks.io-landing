import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/app/dashboard/dashboard.module.css";
import { UploadForm } from "./upload-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "HTML 업로드" };

export default async function NewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>T</span>
          TagWorks
        </Link>
        <div className={styles.topActions}>
          <span className={styles.account}>{user.email}</span>
          <form action="/auth/signout" method="post">
            <button className={styles.signout} type="submit">로그아웃</button>
          </form>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.uploadCard}>
          <Link className={styles.back} href="/dashboard">← 내 페이지로 돌아가기</Link>
          <p className={styles.eyebrow}>New page</p>
          <h1 className={styles.title}>HTML 업로드</h1>
          <p className={styles.subtitle}>
            원본은 비공개로 보관하고, 위험한 실행 요소를 제거한 결과만 별도 주소에서 공개합니다.
          </p>
          <div aria-hidden="true" style={{ height: 28 }} />
          <UploadForm />
        </section>
      </main>
    </div>
  );
}

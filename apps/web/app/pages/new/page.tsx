import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "@/app/dashboard/dashboard.module.css";
import { LanguageSwitcher } from "@/app/components/language-switcher";
import { UploadForm } from "./upload-form";
import { getUploadEntitlement } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "Upload HTML", "HTML 업로드") };
}

export default async function NewPage() {
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const entitlement = await getUploadEntitlement(user.id);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>T</span>
          TagWorks
        </Link>
        <div className={styles.topActions}>
          <LanguageSwitcher locale={locale} />
          <span className={styles.account}>{user.email}</span>
          <form action="/auth/signout" method="post">
            <button className={styles.signout} type="submit">{tx("Log out", "로그아웃")}</button>
          </form>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.uploadCard}>
          <Link className={styles.back} href="/dashboard">← {tx("Back to my pages", "내 페이지로 돌아가기")}</Link>
          <p className={styles.eyebrow}>{tx("New page", "새 페이지")}</p>
          <h1 className={styles.title}>{tx("Upload HTML", "HTML 업로드")}</h1>
          <p className={styles.subtitle}>
            {tx("Your original is stored privately and served from an isolated public URL.", "원본은 비공개로 보관하고, 별도 주소의 격리된 환경에서 공개합니다.")}
          </p>
          <div className={styles.quotaBanner}>
            <div>
              <strong>{tx("Upload allowance", "업로드 이용량")}</strong>
              <span>
                {entitlement.tier === "admin"
                  ? tx("Unlimited uploads", "무제한 업로드")
                  : tx(`${entitlement.totalRemaining} uploads available`, `${entitlement.totalRemaining}개 업로드 가능`)}
              </span>
            </div>
            <Link href="/billing">{entitlement.canUpload ? tx("View plan", "플랜 보기") : tx("Choose a plan", "플랜 선택")}</Link>
          </div>
          {!entitlement.canUpload ? (
            <p className={styles.error}>{tx("Your upload allowance is used up. Choose a plan to publish more pages.", "업로드 이용량을 모두 사용했습니다. 더 게시하려면 플랜을 선택해 주세요.")}</p>
          ) : null}
          <UploadForm locale={locale} disabled={!entitlement.canUpload} canAttachImages={entitlement.paidCustomer} />
        </section>
      </main>
    </div>
  );
}

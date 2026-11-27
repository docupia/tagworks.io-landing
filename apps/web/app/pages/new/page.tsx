import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import styles from "@/app/dashboard/dashboard.module.css";
import { UploadForm } from "./upload-form";
import { getReconciledAccountPlan } from "@/lib/account-plan";
import { getDatabase } from "@/lib/database";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { limitMessage } from "@/lib/limit-messages";
import { PAGE_ID_PATTERN } from "@/lib/page-revisions";
import { fill, SELF_SERVE_MAX_LINKS } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";

type NewPageProps = { searchParams: Promise<{ edit?: string | string[] }> };

export async function generateMetadata({ searchParams }: NewPageProps): Promise<Metadata> {
  const locale = await getLocale();
  const { edit } = await searchParams;
  return { title: edit ? text(locale, "Edit page", "페이지 수정") : text(locale, "Upload HTML", "HTML 업로드") };
}

export default async function NewPage({ searchParams }: NewPageProps) {
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { edit } = await searchParams;

  let editPage: { id: string; title: string; status: string } | null = null;
  if (edit !== undefined) {
    if (typeof edit !== "string" || !PAGE_ID_PATTERN.test(edit)) notFound();
    const [row] = await getDatabase()<{ id: string; title: string; status: string }[]>`
      select id, title, status
      from public.pages
      where id = ${edit}::uuid
        and owner_id = ${user.id}::uuid
        and deleted_at is null
        and status in ('published', 'paused')
    `;
    if (!row) notFound();
    editPage = row;
  }

  const account = await getReconciledAccountPlan(user.id);
  const { limits } = account;
  const atLimit = !editPage && account.liveLinks >= limits.maxLinks;
  const topTier = limits.maxLinks >= SELF_SERVE_MAX_LINKS;
  const usage = account.superAdmin
    ? fill(tx("{live} links live · no limit", "공개 링크 {live}개 · 제한 없음"), { live: account.liveLinks })
    : fill(tx("{live} of {max} links live", "공개 링크 {max}개 중 {live}개 사용 중"), { live: account.liveLinks, max: limits.maxLinks });

  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <section className={styles.uploadCard}>
          <Link className={styles.back} href="/dashboard">← {tx("Back to my pages", "내 페이지로 돌아가기")}</Link>
          <p className={styles.eyebrow}>{editPage ? tx("Edit published page", "게시 페이지 수정") : tx("New page", "새 페이지")}</p>
          <h1 className={styles.title}>{editPage ? editPage.title : tx("Upload HTML", "HTML 업로드")}</h1>
          <p className={styles.subtitle}>
            {tx("Your original is stored privately and served from an isolated public URL.", "원본은 비공개로 보관하고, 별도 주소의 격리된 환경에서 공개합니다.")}
          </p>

          <div className={styles.quotaBanner}>
            <div>
              <strong>{limits.name}</strong>
              <span>{editPage ? tx("Edits are unlimited · the URL and QR code stay the same", "수정은 무제한 · URL과 QR은 그대로") : usage}</span>
            </div>
            <Link href="/billing">{tx("View plan", "플랜 보기")}</Link>
          </div>

          {atLimit ? (
            <section className={styles.limitCard} role="status">
              <p>{limitMessage(locale, topTier ? "custom_needed" : "link_limit", { n: limits.maxLinks, plan: limits.name })}</p>
              <div className={styles.errorActions}>
                {topTier ? (
                  <Link className={styles.primaryButton} href="/contact">{tx("Contact us", "문의하기")}</Link>
                ) : (
                  <Link className={styles.primaryButton} href="/billing">{tx("See plans", "플랜 보기")}</Link>
                )}
                <Link className={styles.secondaryButton} href="/dashboard">{tx("Manage my links", "내 링크 관리")}</Link>
              </div>
            </section>
          ) : (
            <UploadForm
              key={editPage?.id ?? "new"}
              locale={locale}
              revisionPageId={editPage?.id}
              limits={{
                name: limits.name,
                maxHtmlBytes: limits.maxHtmlBytes,
                maxImagesPerLink: limits.maxImagesPerLink,
                maxImageBytes: limits.maxImageBytes,
                maxLinkBytes: limits.maxLinkBytes,
              }}
            />
          )}
        </section>
      </main>
    </div>
  );
}

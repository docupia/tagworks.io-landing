import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/marketing/brand-mark";
import { AuthSubmitButton } from "@/components/auth-submit-button";
import { LanguageSwitcher } from "@/app/components/language-switcher";
import styles from "@/app/auth.module.css";
import { getCurrentUser } from "@/lib/current-user";
import { VIEW_RANGES } from "@/lib/custom-inquiry";
import { LOCALE_TAGS, text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { fill, PLANS, SELF_SERVE_MAX_LINKS } from "@/lib/plans";
import { submitCustomInquiry } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: text(locale, "Custom plan inquiry", "Custom 플랜 문의") };
}

type SearchParams = Promise<{ sent?: string; error?: string }>;

export default async function ContactPage({ searchParams }: { searchParams: SearchParams }) {
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const params = await searchParams;
  const user = await getCurrentUser();
  const number = new Intl.NumberFormat(LOCALE_TAGS[locale]);
  const minimum = SELF_SERVE_MAX_LINKS + 1;
  const errors: Record<string, string> = {
    email: tx("Enter a valid email address.", "올바른 이메일 주소를 입력해 주세요."),
    links: fill(tx("Enter a number of links from {n}.", "{n}개 이상의 링크 수를 입력해 주세요."), { n: minimum }),
    use_case: tx("Tell us briefly how you'll use TagWorks.", "TagWorks를 어떻게 쓰실지 간단히 알려 주세요."),
    too_many: tx("We've already received several inquiries from you today. We'll reply soon.", "오늘 이미 여러 번 문의를 받았어요. 곧 답장드릴게요."),
  };
  const viewLabels: Record<number, string> = {
    50_000: fill(tx("Up to {n}", "{n}회 이하"), { n: number.format(50_000) }),
    200_000: `${number.format(50_000)}–${number.format(200_000)}`,
    1_000_000: `${number.format(200_000)}–${number.format(1_000_000)}`,
    5_000_000: fill(tx("More than {n}", "{n}회 초과"), { n: number.format(1_000_000) }),
  };

  return (
    <main className={styles.page}>
      <section className={`${styles.card} ${styles.wideCard}`}>
        <div className={styles.authTopline}>
          <Link className="brand" href="/" aria-label={tx("TagWorks home", "TagWorks 홈")}>
            <BrandMark /><span>TagWorks</span>
          </Link>
          <LanguageSwitcher locale={locale} />
        </div>
        <p className={styles.eyebrow}>Custom</p>
        <h1 className={styles.title}>{fill(tx("Need more than {n} links?", "링크가 {n}개보다 더 필요하세요?"), { n: PLANS.pro.maxLinks })}</h1>
        {params.sent ? (
          <>
            <p className={styles.notice} role="status">{tx("Thanks! We received your inquiry and will reply by email soon.", "문의를 받았어요. 곧 이메일로 답장드릴게요.")}</p>
            <p className={styles.switch}><Link href={user ? "/dashboard" : "/"}>{user ? tx("Back to my pages", "내 페이지로 돌아가기") : tx("Back to home", "홈으로 돌아가기")}</Link></p>
          </>
        ) : (
          <>
            <p className={styles.description}>{tx("Tell us what you need and we'll set up a plan with the links and traffic you expect.", "필요한 링크 수와 예상 트래픽을 알려 주시면 맞춤 플랜을 설정해 드려요.")}</p>
            {params.error && errors[params.error] ? <p className={styles.error} role="alert">{errors[params.error]}</p> : null}
            <form className={styles.form} action={submitCustomInquiry}>
              <label className={styles.field}>
                {tx("Email", "이메일")}
                <input name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={user?.email ?? ""} />
              </label>
              <label className={styles.field}>
                {tx("Links you need", "필요한 링크 수")}
                <input name="links" type="number" inputMode="numeric" min={minimum} max={100000} step={1} required defaultValue={50} />
                <span className={styles.hint}>{fill(tx("{n} or more live links at the same time.", "동시에 공개할 링크 {n}개 이상"), { n: minimum })}</span>
              </label>
              <label className={styles.field}>
                {tx("Expected page views per month", "월 예상 페이지뷰")}
                <select name="views" defaultValue="">
                  <option value="">{tx("Not sure yet", "아직 모르겠어요")}</option>
                  {VIEW_RANGES.map((range) => <option key={range.value} value={range.value}>{viewLabels[range.value]}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                {tx("How will you use TagWorks?", "TagWorks를 어떻게 쓰실 건가요?")}
                <textarea name="use_case" required maxLength={2000} placeholder={tx("For example: event pages for 80 stores, updated weekly", "예: 매장 80곳의 행사 페이지를 매주 갱신")} />
              </label>
              <label className={styles.honeypot} aria-hidden="true">
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
              <AuthSubmitButton pendingLabel={tx("Sending…", "보내는 중…")}>{tx("Send inquiry", "문의 보내기")}</AuthSubmitButton>
            </form>
            <p className={styles.switch}>
              {tx("Or email us at", "또는 이메일로 문의하세요:")} <a href="mailto:info@tagworks.io">info@tagworks.io</a>
            </p>
          </>
        )}
      </section>
    </main>
  );
}

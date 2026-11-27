import Link from "next/link";
import { text, type Locale } from "@/lib/i18n";
import styles from "./blog.module.css";

export function BlogCta({ locale }: { locale: Locale }) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  return (
    <section className={styles.cta}>
      <h2>{tx("Give your page a link", "페이지에 링크를 달아 보세요")}</h2>
      <p>{tx("Free forever for your first link. No card needed.", "첫 링크는 계속 무료예요. 카드 등록도 필요 없어요.")}</p>
      <Link prefetch={false} className={styles.ctaButton} href="/signup?utm_source=blog&utm_medium=guide">
        {tx("Start free", "무료로 시작하기")}
      </Link>
    </section>
  );
}

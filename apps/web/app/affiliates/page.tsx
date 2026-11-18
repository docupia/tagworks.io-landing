import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/marketing/brand-mark";
import { LanguageSwitcher } from "@/app/components/language-switcher";
import { getLocale } from "@/lib/i18n-server";
import { copy } from "./copy";
import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const c = copy[await getLocale()];
  return { title: c[0], description: c[1] };
}

const joinUrl = "/login?next=%2Fdashboard%2Faffiliates";

export default async function AffiliatesPage() {
  const locale = await getLocale();
  const c = copy[locale];
  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className="brand" href="/"><BrandMark /><span>TagWorks</span></Link>
        <a href="#terms">{c[22]}</a>
        <LanguageSwitcher locale={locale} />
      </nav>
      <div className={styles.hero}>
        <header>
          <p>TAGWORKS AFFILIATE</p>
          <h1>{c[0]}</h1>
          <p>{c[1]}</p>
          <Link className={styles.cta} href={joinUrl}>{c[2]}</Link>
          <p>{c[3]}</p>
        </header>
        <aside className={styles.ticket}>
          <p>{c[4]}</p>
          <div className={styles.rate}>30%</div>
          <p>{c[5]}<br /><strong>{c[6]}</strong></p>
          <p>{c[7]}</p>
        </aside>
      </div>
      <section>
        <h2>{c[8]}</h2>
        <div className={styles.steps}>
          {[9, 11, 13].map(index => <article key={index}><h3>{c[index]}</h3><p>{c[index + 1]}</p></article>)}
        </div>
      </section>
      <section id="terms">
        <h2>{c[15]}</h2>
        <details open><summary>{c[16]}</summary><p>{c[17]}</p></details>
        <details><summary>{c[18]}</summary><p>{c[19]}</p></details>
      </section>
      <footer><h2>{c[20]}</h2><Link className={styles.cta} href={joinUrl}>{c[21]}</Link></footer>
    </main>
  );
}

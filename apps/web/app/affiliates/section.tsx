import Link from "next/link";
import { getLocale } from "@/lib/i18n-server";
import { copy } from "./copy";
import styles from "./page.module.css";

const joinUrl = "/login?next=%2Fdashboard%2Faffiliates";

export async function AffiliateSection() {
  const locale = await getLocale();
  const c = copy[locale];
  return (
    <section id="affiliates" className={styles.page} aria-labelledby="affiliate-title">
      <div className={styles.hero}>
        <header>
          <p>TAGWORKS AFFILIATE</p>
          <h2 id="affiliate-title">{c[0]}</h2>
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
        <h3>{c[8]}</h3>
        <div className={styles.steps}>
          {[9, 11, 13].map(index => <article key={index}><h3>{c[index]}</h3><p>{c[index + 1]}</p></article>)}
        </div>
      </section>
      <section id="affiliate-terms">
        <h3>{c[15]}</h3>
        <details open><summary>{c[16]}</summary><p>{c[17]}</p></details>
        <details><summary>{c[18]}</summary><p>{c[19]}</p></details>
      </section>
      <footer><h3>{c[20]}</h3><Link className={styles.cta} href={joinUrl}>{c[21]}</Link></footer>
    </section>
  );
}

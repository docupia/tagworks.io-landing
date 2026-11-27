import Link from "next/link";
import { text, type Locale } from "@/lib/i18n";
import styles from "./analytics.module.css";

// Fixed sample shapes, never real data: basic plans do not receive flow data.
const SAMPLE = [
  { source: "Instagram", width: 92, outcome: 64 },
  { source: "Blog", width: 58, outcome: 40 },
  { source: "Direct", width: 34, outcome: 22 },
];

/** A blurred sample of a full-only view with an upgrade button on top. */
export function LockedPreview({ locale, label }: { locale: Locale; label: string }) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  return (
    <div className={styles.locked}>
      <div className={styles.lockedSample} aria-hidden="true">
        {SAMPLE.map((row) => (
          <div className={styles.lockedRow} key={row.source}>
            <span>{row.source}</span>
            <i style={{ width: `${row.width}%` }} />
            <b style={{ width: `${row.outcome}%` }} />
          </div>
        ))}
      </div>
      <div className={styles.lockedOverlay}>
        <p>{tx("Pro shows where visits came from and which link they clicked first.", "Pro에서는 방문이 어디에서 와서 어떤 링크를 먼저 눌렀는지 볼 수 있어요.")}</p>
        <Link className={styles.lockedButton} href="/billing">{label}</Link>
      </div>
    </div>
  );
}

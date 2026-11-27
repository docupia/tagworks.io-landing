import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/current-user";
import { getLocale } from "@/lib/i18n-server";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { AffiliateSection } from "./section";
import styles from "../home.module.css";

export const metadata: Metadata = { title: "Affiliate" };

export default async function AffiliatesPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  return (
    <div className={styles.page}>
      <SiteHeader locale={locale} member={user ? user.email ?? "Member" : undefined} current="affiliates" />
      <main id="main"><AffiliateSection /></main>
      <SiteFooter locale={locale} />
    </div>
  );
}

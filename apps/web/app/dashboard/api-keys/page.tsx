import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import { ApiKeysPanel, type KeyRow } from "./panel";
import styles from "../dashboard.module.css";

export default async function ApiKeysPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const locale = await getLocale();
  const { data, error } = await supabase.from("personal_api_keys").select("id,name,key_prefix,created_at,last_used_at,revoked_at").order("created_at", { ascending: false });
  return <div className={styles.shell}><main className={styles.main}>
    <Link className={styles.back} href="/dashboard">← {text(locale, "Dashboard", "대시보드")}</Link>
    <h1 className={styles.title}>Personal API Keys & MCP</h1>
    {error ? <p className={styles.error}>{text(locale, "Could not load API keys. Please try again.", "API 키를 불러오지 못했습니다. 다시 시도해 주세요.")}</p> : <ApiKeysPanel keys={(data ?? []) as KeyRow[]} siteUrl={getSiteUrl()} locale={locale} />}
  </main></div>;
}

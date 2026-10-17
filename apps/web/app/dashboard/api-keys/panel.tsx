"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { text, type Locale } from "@/lib/i18n";
import styles from "../dashboard.module.css";
export type KeyRow = { id: string; name: string; key_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null };
export function ApiKeysPanel({ keys, siteUrl, locale }: { keys: KeyRow[]; siteUrl: string; locale: Locale }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const tx = (en: string, ko: string) => text(locale, en, ko);
  async function mutate(method: "POST" | "DELETE", body: object) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/keys", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error); }
      if (method === "POST") { const result = await response.json(); setToken(result.token); setName(""); }
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed."); }
    finally { setBusy(false); }
  }
  return <div className={styles.apiPanel}>
    <p className={styles.subtitle}>{tx("Publish HTML from external tools using your account's upload allowance.", "외부 도구에서 내 계정의 업로드 권한으로 HTML을 게시하세요.")}</p>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void mutate("POST", { name }); }}>
      <label className={styles.field}>{tx("Key name", "키 이름")}<input value={name} maxLength={80} required onChange={event => setName(event.target.value)} placeholder="My coding assistant" /></label>
      <button className={styles.submit} disabled={busy || !name.trim()}>{tx("Create API key", "API 키 발급")}</button>
    </form>
    {token ? <section className={styles.success} role="status">
      <p>{tx("Copy this key now. It is shown only once. Keep it secret.", "지금 키를 복사해 주세요. 한 번만 표시됩니다. 외부에 공개하지 마세요.")}</p>
      <code className={styles.apiCode}>{token}</code>
      <button className={styles.secondaryButton} onClick={() => { void navigator.clipboard.writeText(token).catch(() => setError(tx("Copy failed. Select and copy the key manually.", "복사하지 못했습니다. 키를 선택해 직접 복사해 주세요."))); }}>{tx("Copy key", "키 복사")}</button>{" "}
      <button className={styles.secondaryButton} onClick={() => setToken("")}>{tx("Hide key", "키 숨기기")}</button>
    </section> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <section aria-label="API keys">
      {keys.map(key => <article className={styles.apiKeyRow} key={key.id}>
        <div><strong>{key.name}</strong><p><code>{key.key_prefix}…</code> · {key.revoked_at ? tx("Revoked", "폐기됨") : tx("Active", "활성")}</p><small>{tx("Last used", "최근 사용")}: {key.last_used_at ? new Date(key.last_used_at).toISOString() : "—"}</small></div>
        {!key.revoked_at ? <button className={styles.secondaryButton} disabled={busy} onClick={() => { if (window.confirm(tx("Revoke this key? Connected tools will lose access immediately.", "이 키를 폐기할까요? 연결된 도구의 접근이 즉시 중단됩니다."))) void mutate("DELETE", { id: key.id }); }}>{tx("Revoke", "폐기")}</button> : null}
      </article>)}
    </section>
    <section><h2>REST API</h2><p>{tx("Send HTML and a management title. Each successful request creates a new page and uses one upload.", "HTML과 관리용 제목을 전달하세요. 성공한 요청마다 새 페이지를 생성하고 업로드 권한 1개를 사용합니다.")}</p>
      <pre className={styles.apiCode}>{`curl '${siteUrl}/api/v1/deploy' \\\n  -H 'Authorization: Bearer YOUR_API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"title":"Hello","html":"<!doctype html><html><head></head><body><h1>Hello</h1></body></html>"}'`}</pre>
      <p>{tx("The response includes publicUrl, pathUrl, page.id and page.slug. HTML is limited to 1 MiB. API requests are limited to 120 per minute per account.", "응답에는 publicUrl, pathUrl, page.id, page.slug가 포함됩니다. HTML은 1MiB까지, API 호출은 계정당 분당 120회까지 가능합니다.")}</p>
    </section>
    <section><h2>MCP</h2><p>{tx("Connect an MCP client that supports Streamable HTTP and custom Authorization headers. OAuth-only clients are not supported.", "Streamable HTTP와 Authorization 헤더 설정을 지원하는 MCP 클라이언트를 연결하세요. OAuth 전용 클라이언트는 지원하지 않습니다.")}</p>
      <pre className={styles.apiCode}>{JSON.stringify({ mcpServers: { tagworks: { url: `${siteUrl}/api/mcp`, headers: { Authorization: "Bearer YOUR_API_KEY" } } } }, null, 2)}</pre>
      <p><code>deploy_html</code> · <code>get_upload_allowance</code></p>
      <p>{tx("Configuration format varies by client. Use an environment variable or the client's secret store for the key.", "클라이언트마다 설정 형식이 다릅니다. 키는 환경 변수나 클라이언트의 비밀 저장소에 보관하세요.")}</p>
    </section>
  </div>;
}

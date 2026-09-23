"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/dashboard/dashboard.module.css";

const MAX_HTML_BYTES = 1024 * 1024;

type UploadResult = {
  page: { id: string; slug: string; title: string };
  publicUrl: string;
  warnings: string[];
};

export function UploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setResult(null);

    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("업로드할 HTML 파일을 선택해 주세요.");
      setPending(false);
      return;
    }
    if (file.size > MAX_HTML_BYTES) {
      setError("HTML 파일은 1MiB 이하만 업로드할 수 있습니다.");
      setPending(false);
      return;
    }

    try {
      const response = await fetch("/api/pages", { method: "POST", body: formData });
      const body = (await response.json()) as UploadResult & { error?: string };
      if (!response.ok) throw new Error(body.error || "업로드를 완료하지 못했습니다.");

      setResult(body);
      formRef.current?.reset();
      setFileName("");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "업로드를 완료하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        페이지 제목
        <input name="title" required maxLength={100} placeholder="예: 9월 캠페인 안내" />
      </label>
      <label className={styles.field}>
        설명 <span className={styles.hint}>선택 · 최대 300자</span>
        <textarea name="description" rows={3} maxLength={300} placeholder="페이지 용도를 짧게 적어 주세요." />
      </label>
      <label className={styles.dropzone}>
        <input
          name="file"
          type="file"
          accept=".html,.htm,text/html"
          required
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
        />
        <span aria-hidden="true">↑</span>
        <span className={styles.dropTitle}>{fileName || "HTML 파일 선택"}</span>
        <span className={styles.hint}>.html 또는 .htm · 최대 1MiB · 실행 코드는 안전하게 제거됩니다.</span>
      </label>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {result ? (
        <div className={styles.success} role="status">
          <strong>고정 링크가 만들어졌습니다.</strong>
          <div className={styles.publicLink}>
            <a href={result.publicUrl} target="_blank" rel="noreferrer">{result.publicUrl}</a>
            <button className={styles.copy} type="button" onClick={copyLink}>
              {copied ? "복사됨" : "링크 복사"}
            </button>
          </div>
          {result.warnings.length ? (
            <ul className={styles.warningList}>
              {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? "안전 검사 후 게시 중…" : "업로드하고 고정 링크 만들기"}
      </button>
    </form>
  );
}

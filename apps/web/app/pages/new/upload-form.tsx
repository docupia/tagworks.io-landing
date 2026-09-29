"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/dashboard/dashboard.module.css";
import { deriveUploadTitle, titleFromHtmlFileName } from "@/lib/upload-title";

const MAX_HTML_BYTES = 1024 * 1024;

type UploadResult = {
  page: { id: string; slug: string; title: string };
  publicUrl: string;
  warnings: string[];
};

export function UploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const titleWasEdited = useRef(false);
  const fileSelection = useRef(0);
  const [title, setTitle] = useState("");
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
      fileSelection.current += 1;
      titleWasEdited.current = false;
      setTitle("");
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

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const selection = ++fileSelection.current;
    setFileName(file?.name ?? "");
    if (!file || titleWasEdited.current) return;

    // Give immediate feedback, then replace it with the document title once the
    // file has been read. A user edit made while reading always wins.
    setTitle(titleFromHtmlFileName(file.name));
    try {
      const source = await file.text();
      if (fileSelection.current === selection && !titleWasEdited.current) {
        setTitle(deriveUploadTitle(source, file.name));
      }
    } catch {
      // The filename fallback is already in place; server validation reports an
      // unreadable or non-UTF-8 document on submit.
    }
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        관리용 제목 <span className={styles.hint}>원본 문서 제목을 자동 입력</span>
        <input
          name="title"
          required
          maxLength={100}
          placeholder="HTML 파일을 선택하면 자동으로 입력됩니다."
          value={title}
          onChange={(event) => {
            titleWasEdited.current = true;
            setTitle(event.target.value);
          }}
        />
        <span className={styles.hint}>
          내 페이지 목록에 표시됩니다. 파일의 원본 &lt;head&gt;&lt;title&gt;은 공개 문서에 유지됩니다.
        </span>
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
          onChange={selectFile}
        />
        <span aria-hidden="true">↑</span>
        <span className={styles.dropTitle}>{fileName || "HTML 파일 선택"}</span>
        <span className={styles.hint}>.html 또는 .htm · 최대 1MiB · 문서 제목을 읽어 관리용 제목에 반영합니다.</span>
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

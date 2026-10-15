"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PageQrCode } from "@/app/components/page-qr-code";
import styles from "@/app/dashboard/dashboard.module.css";
import { deriveUploadTitle, titleFromHtmlFileName } from "@/lib/upload-title";
import { text, type Locale } from "@/lib/i18n";

const MAX_HTML_BYTES = 1024 * 1024;

type UploadResult = {
  page: { id: string; slug: string; title: string };
  publicUrl: string;
  warnings: string[];
};

const ENGLISH_WARNINGS: Record<string, string> = {
  "원본 스크립트와 상호작용 코드가 격리된 공개 환경에서 실행됩니다.": "The original scripts and interactions run in an isolated public environment.",
  "외부 이미지·폰트·스타일·스크립트는 방문 시 해당 제공자에게 직접 요청됩니다.": "External images, fonts, styles, and scripts are requested directly from their providers when the page is visited.",
  "HTTP 외부 리소스는 HTTPS 공개 페이지에서 브라우저가 차단할 수 있습니다.": "Browsers may block HTTP resources on the HTTPS public page.",
};

export function UploadForm({ locale }: { locale: Locale }) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
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
  const displayWarning = (warning: string) => {
    if (locale === "ko") return warning;
    if (ENGLISH_WARNINGS[warning]) return ENGLISH_WARNINGS[warning];
    const tracked = warning.match(/^외부 링크 분석은 문서에서 처음 (\d+)개까지 적용됩니다\.$/);
    return tracked ? `Outbound-link analytics are applied to the first ${tracked[1]} links in the document.` : warning;
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setResult(null);

    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) {
      setError(tx("Choose an HTML file to upload.", "업로드할 HTML 파일을 선택해 주세요."));
      setPending(false);
      return;
    }
    if (file.size > MAX_HTML_BYTES) {
      setError(tx("HTML files must be 1 MiB or smaller.", "HTML 파일은 1MiB 이하만 업로드할 수 있습니다."));
      setPending(false);
      return;
    }

    try {
      const response = await fetch("/api/pages", { method: "POST", body: formData });
      const body = (await response.json()) as UploadResult & { error?: string };
      if (!response.ok) throw new Error(body.error || tx("Could not complete the upload.", "업로드를 완료하지 못했습니다."));

      setResult(body);
      formRef.current?.reset();
      fileSelection.current += 1;
      titleWasEdited.current = false;
      setTitle("");
      setFileName("");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tx("Could not complete the upload.", "업로드를 완료하지 못했습니다."));
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
        {tx("Management title", "관리용 제목")} <span className={styles.hint}>{tx("Filled from the document title", "원본 문서 제목을 자동 입력")}</span>
        <input
          name="title"
          required
          maxLength={100}
          placeholder={tx("Select an HTML file to fill this automatically.", "HTML 파일을 선택하면 자동으로 입력됩니다.")}
          value={title}
          onChange={(event) => {
            titleWasEdited.current = true;
            setTitle(event.target.value);
          }}
        />
        <span className={styles.hint}>
          {tx("Shown in your page list and the published page's browser tab.", "내 페이지 목록과 공개 페이지의 브라우저 탭 제목에 표시됩니다.")}
        </span>
      </label>
      <label className={styles.field}>
        {tx("Description", "설명")} <span className={styles.hint}>{tx("Optional · up to 300 characters", "선택 · 최대 300자")}</span>
        <textarea name="description" rows={3} maxLength={300} placeholder={tx("Briefly describe what this page is for.", "페이지 용도를 짧게 적어 주세요.")} />
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
        <span className={styles.dropTitle}>{fileName || tx("Choose an HTML file", "HTML 파일 선택")}</span>
        <span className={styles.hint}>
          {tx(".html or .htm · up to 1 MiB · scripts and external CSS run in an isolated public environment.", ".html 또는 .htm · 최대 1MiB · 원본 스크립트와 외부 CSS를 격리된 공개 환경에서 그대로 실행합니다.")}
        </span>
      </label>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {result ? (
        <div className={styles.success} role="status">
          <strong>{tx("Your permanent link is ready.", "고정 링크가 만들어졌습니다.")}</strong>
          <div className={styles.publicLink}>
            <a href={result.publicUrl} target="_blank" rel="noreferrer">{result.publicUrl}</a>
            <button className={styles.copy} type="button" onClick={copyLink}>
              {copied ? tx("Copied", "복사됨") : tx("Copy link", "링크 복사")}
            </button>
          </div>
          <PageQrCode
            fileName={`tagworks-${result.page.slug}-qr.png`}
            title={result.page.title}
            url={result.publicUrl}
            locale={locale}
          />
          {result.warnings.length ? (
            <ul className={styles.warningList}>
              {result.warnings.map((warning) => <li key={warning}>{displayWarning(warning)}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? tx("Checking and publishing…", "안전 검사 후 게시 중…") : tx("Upload and create permanent link", "업로드하고 고정 링크 만들기")}
      </button>
    </form>
  );
}

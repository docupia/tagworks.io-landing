"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageQrCode } from "@/app/components/page-qr-code";
import styles from "@/app/dashboard/dashboard.module.css";
import { text, type Locale } from "@/lib/i18n";
import { optimizeImage, type OptimizedImage } from "@/lib/image-optimizer";
import { limitMessage, type LimitCode, type LimitValues } from "@/lib/limit-messages";
import { fill, formatBytes, type ResolvedLimits } from "@/lib/plans";
import { createClient } from "@/lib/supabase/client";
import { rewriteUploadedImages } from "@/lib/upload-images";
import { filesFromDrop, imageType, splitSelection } from "@/lib/upload-selection";
import { deriveUploadTitle, titleFromHtmlFileName } from "@/lib/upload-title";

type UploadResult = {
  page: { id: string; slug: string; title: string };
  publicUrl: string;
  warnings: string[];
  missingImages: string[];
};

type Problem = { message: string; code?: string };

type FormLimits = Pick<ResolvedLimits, "name" | "maxHtmlBytes" | "maxImagesPerLink" | "maxImageBytes" | "maxLinkBytes">;

const ENGLISH_WARNINGS: Record<string, string> = {
  "원본 스크립트와 상호작용 코드가 격리된 공개 환경에서 실행됩니다.": "The original scripts and interactions run in an isolated public environment.",
  "외부 이미지·폰트·스타일·스크립트는 방문 시 해당 제공자에게 직접 요청됩니다.": "External images, fonts, styles, and scripts are requested directly from their providers when the page is visited.",
  "HTTP 외부 리소스는 HTTPS 공개 페이지에서 브라우저가 차단할 수 있습니다.": "Browsers may block HTTP resources on the HTTPS public page.",
};

const readDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

export function UploadForm({ locale, limits, disabled = false, revisionPageId }: {
  locale: Locale;
  limits: FormLimits;
  disabled?: boolean;
  revisionPageId?: string;
}) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const message = (code: LimitCode, values: LimitValues) => limitMessage(locale, code, values);
  const router = useRouter();
  const titleWasEdited = useRef(false);
  const selectionId = useRef(0);
  const [html, setHtml] = useState<File | null>(null);
  const [images, setImages] = useState<OptimizedImage[]>([]);
  const [optimizing, setOptimizing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<"" | "uploading" | "publishing">("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [preview, setPreview] = useState<{ html: string; missing: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  const totalBytes = (html?.size ?? 0) + images.reduce((sum, image) => sum + image.blob.size, 0);
  const busy = Boolean(pending) || optimizing;

  const displayWarning = (warning: string) => {
    if (locale === "ko") return warning;
    if (ENGLISH_WARNINGS[warning]) return text(locale, ENGLISH_WARNINGS[warning], warning);
    const tracked = warning.match(/^외부 링크 분석은 문서에서 처음 (\d+)개까지 적용됩니다\.$/);
    return tracked ? text(locale, `Outbound-link analytics are applied to the first ${tracked[1]} links in the document.`, warning) : warning;
  };

  /** Checks a selection against the plan before anything is uploaded. */
  function checkSelection(file: File | null, files: OptimizedImage[]): Problem | null {
    if (!file) return null;
    if (file.size > limits.maxHtmlBytes) {
      return { code: "file_too_large", message: message("file_too_large", { file: file.name, size: file.size, plan: limits.name, limit: limits.maxHtmlBytes }) };
    }
    if (files.length > limits.maxImagesPerLink) {
      return { code: "too_many_images", message: message("too_many_images", { count: files.length, plan: limits.name, limit: limits.maxImagesPerLink }) };
    }
    const large = files.find((image) => image.originalBytes > limits.maxImageBytes);
    if (large) {
      return { code: "file_too_large", message: message("file_too_large", { file: large.name, size: large.originalBytes, plan: limits.name, limit: limits.maxImageBytes }) };
    }
    const total = file.size + files.reduce((sum, image) => sum + image.blob.size, 0);
    if (total > limits.maxLinkBytes) {
      const largest = [...files].sort((a, b) => b.blob.size - a.blob.size).slice(0, 3)
        .map((image) => `${image.name} (${formatBytes(image.blob.size)})`).join(", ");
      return { code: "link_too_large", message: `${message("link_too_large", { size: total, plan: limits.name, limit: limits.maxLinkBytes })} ${fill(tx("Largest files: {files}", "가장 큰 파일: {files}"), { files: largest })}` };
    }
    return null;
  }

  async function buildPreview(file: File, files: OptimizedImage[], selection: number) {
    try {
      const source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      const urls = await Promise.all(files.map((image) => readDataUrl(image.blob)));
      if (selection !== selectionId.current) return;
      const map = new Map(files.map((image, index) => [image.name, urls[index]]));
      const rewritten = rewriteUploadedImages(source, map, 24 * 1024 * 1024);
      const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https:; font-src https: data:; base-uri 'none'; form-action 'none'">`;
      const doctype = rewritten.html.match(/^\s*<!doctype[^>]*>/i)?.[0] ?? "";
      setPreview({ html: doctype + policy + rewritten.html.slice(doctype.length), missing: rewritten.missing });
      if (!revisionPageId && !titleWasEdited.current) setTitle(deriveUploadTitle(source, file.name));
    } catch (reason) {
      if (selection !== selectionId.current) return;
      setPreview(null);
      setProblem({ message: reason instanceof RangeError
        ? tx("The preview is too large. Try using smaller images.", "미리보기 용량이 너무 큽니다. 이미지 크기를 줄여 주세요.")
        : tx("Could not preview the HTML. Check that it uses UTF-8.", "HTML을 미리 볼 수 없습니다. UTF-8로 저장했는지 확인해 주세요.") });
    }
  }

  async function select(files: File[], mode: "replace" | "add") {
    if (busy || disabled || !files.length) return;
    const selection = ++selectionId.current;
    setProblem(null);
    setResult(null);
    const split = splitSelection(files);
    if (split.html.length > 1) {
      setProblem({ message: tx("Choose one HTML file per link.", "링크 하나에 HTML 파일은 1개만 올릴 수 있어요.") });
      return;
    }
    if (split.duplicates.length) {
      setProblem({ message: fill(tx("Two images share the name {names}. Rename one and try again.", "이름이 같은 이미지가 있어요: {names}. 하나의 이름을 바꿔 주세요."), { names: split.duplicates.join(", ") }) });
      return;
    }
    if (split.rejected.length) {
      setProblem({ code: "image_type", message: message("image_type", { file: split.rejected.map((file) => file.name).join(", ") }) });
      return;
    }
    const nextHtml = split.html[0] ?? (mode === "add" ? html : null);
    if (!nextHtml) {
      setProblem({ message: tx("Choose an HTML file.", "HTML 파일을 선택해 주세요.") });
      return;
    }
    if (!revisionPageId && !titleWasEdited.current && split.html[0]) setTitle(titleFromHtmlFileName(nextHtml.name));

    setOptimizing(true);
    try {
      const optimized = await Promise.all(split.images.map((file) =>
        optimizeImage(file.type ? file : new File([file], file.name, { type: imageType(file) ?? "" }))));
      if (selection !== selectionId.current) return;
      const kept = mode === "add"
        ? [...images.filter((image) => !optimized.some((next) => next.name === image.name)), ...optimized]
        : optimized;
      setHtml(nextHtml);
      setImages(kept);
      setProblem(checkSelection(nextHtml, kept));
      await buildPreview(nextHtml, kept, selection);
    } finally {
      if (selection === selectionId.current) setOptimizing(false);
    }
  }

  function onPick(event: ChangeEvent<HTMLInputElement>, mode: "replace" | "add") {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    void select(files, mode);
  }

  async function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void select(await filesFromDrop(event.dataTransfer), "replace");
  }

  function removeImage(name: string) {
    const kept = images.filter((image) => image.name !== name);
    const selection = ++selectionId.current;
    setImages(kept);
    setProblem(checkSelection(html, kept));
    if (html) void buildPreview(html, kept, selection);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!html || !preview || busy || disabled) return;
    const local = checkSelection(html, images);
    if (local) {
      setProblem(local);
      return;
    }
    setProblem(null);
    setResult(null);
    setPending("uploading");
    try {
      // 1. Reserve signed upload slots for this link and version.
      const prepare = await fetch("/api/pages/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: revisionPageId,
          htmlBytes: html.size,
          images: images.map((image) => ({ name: image.name, size: image.blob.size, originalSize: image.originalBytes, type: image.type })),
        }),
      });
      const slots = await prepare.json() as { pageId?: string; versionId?: string; uploads?: Array<{ name: string; path: string; token: string }>; error?: string; code?: string };
      if (!prepare.ok || !slots.pageId || !slots.versionId || !slots.uploads) {
        throw Object.assign(new Error(slots.error || tx("Could not complete the upload.", "업로드를 완료하지 못했습니다.")), { code: slots.code });
      }

      // 2. Upload images straight to storage.
      const storage = createClient().storage.from("page-images");
      const byName = new Map(images.map((image) => [image.name, image]));
      await Promise.all(slots.uploads.map(async (slot) => {
        const image = byName.get(slot.name)!;
        const { error } = await storage.uploadToSignedUrl(slot.path, slot.token, image.blob, {
          contentType: image.type,
          cacheControl: "31536000",
        });
        if (error) throw new Error(fill(tx("Could not upload {file}. Please try again.", "{file}을(를) 올리지 못했어요. 다시 시도해 주세요."), { file: image.name }));
      }));

      // 3. Publish the HTML. The server checks everything again.
      setPending("publishing");
      const formData = new FormData();
      formData.set("file", html);
      formData.set("pageId", slots.pageId);
      formData.set("versionId", slots.versionId);
      formData.set("images", JSON.stringify(slots.uploads.map(({ name, path }) => ({ name, path }))));
      if (!revisionPageId) {
        formData.set("title", title);
        formData.set("description", description);
      }
      const response = await fetch("/api/pages", { method: revisionPageId ? "PATCH" : "POST", body: formData });
      const body = await response.json() as UploadResult & { error?: string; code?: string };
      if (!response.ok) throw Object.assign(new Error(body.error || tx("Could not complete the upload.", "업로드를 완료하지 못했습니다.")), { code: body.code });

      setResult(body);
      selectionId.current += 1;
      setHtml(null);
      setImages([]);
      setPreview(null);
      titleWasEdited.current = false;
      setTitle("");
      setDescription("");
      router.refresh();
    } catch (reason) {
      setProblem({
        message: reason instanceof Error ? reason.message : tx("Could not complete the upload.", "업로드를 완료하지 못했습니다."),
        code: (reason as { code?: string }).code,
      });
    } finally {
      setPending("");
    }
  }

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const nextStep = problem?.code === "link_limit" ? (
    <Link className={styles.secondaryButton} href="/billing">{tx("See plans", "플랜 보기")}</Link>
  ) : problem?.code === "custom_needed" ? (
    <Link className={styles.secondaryButton} href="/contact">{tx("Contact us", "문의하기")}</Link>
  ) : problem?.code === "too_many_images" || problem?.code === "file_too_large" || problem?.code === "link_too_large" ? (
    <Link className={styles.secondaryButton} href="/billing">{tx("See plans with higher limits", "한도가 더 큰 플랜 보기")}</Link>
  ) : null;

  return (
    <form className={styles.form} onSubmit={submit}>
      {revisionPageId ? (
        <p className={styles.hint}>{tx(
          "Edits are unlimited and the link and QR code stay the same. Upload every image the page uses each time: the previous images are replaced.",
          "수정은 무제한이고 링크와 QR은 그대로예요. 이전 이미지는 새로 올린 이미지로 바뀌니, 페이지에 쓰는 이미지를 매번 모두 올려 주세요.",
        )}</p>
      ) : null}

      <label
        className={styles.dropzone}
        data-dragging={dragging ? "" : undefined}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input type="file" multiple accept=".html,.htm,text/html,.png,.jpg,.jpeg,.webp,.gif" disabled={busy || disabled} onChange={(event) => onPick(event, "replace")} />
        <span aria-hidden="true">↑</span>
        <span className={styles.dropTitle}>{html ? html.name : tx("Choose or drop your HTML and images", "HTML과 이미지를 선택하거나 끌어다 놓으세요")}</span>
        <span className={styles.hint}>
          {fill(tx(
            "One HTML file (up to {html}) and up to {count} images (PNG, JPG, WebP, GIF, {image} each). You can also drop a whole folder.",
            "HTML 1개(최대 {html})와 이미지 최대 {count}장(PNG·JPG·WebP·GIF, 장당 {image})까지 올릴 수 있어요. 폴더째 끌어다 놓아도 돼요.",
          ), { html: formatBytes(limits.maxHtmlBytes), count: limits.maxImagesPerLink, image: formatBytes(limits.maxImageBytes) })}
        </span>
      </label>

      {html ? (
        <section className={styles.fileSummary} aria-label={tx("Selected files", "선택한 파일")}>
          <div className={styles.fileSummaryHead}>
            <strong>{fill(tx("{count} images · {size} total after optimization", "이미지 {count}장 · 최적화 후 총 {size}"), { count: images.length, size: formatBytes(totalBytes) })}</strong>
            <label className={styles.copy}>
              {tx("Add images", "이미지 추가")}
              <input className={styles.visuallyHidden} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif" disabled={busy || disabled} onChange={(event) => onPick(event, "add")} />
            </label>
          </div>
          {images.length ? (
            <ul className={styles.fileList}>
              {images.map((image) => (
                <li key={image.name}>
                  <span>{image.name}</span>
                  <small>{image.blob.size < image.originalBytes ? `${formatBytes(image.originalBytes)} → ${formatBytes(image.blob.size)}` : formatBytes(image.blob.size)}</small>
                  <button type="button" className={styles.copy} onClick={() => removeImage(image.name)} disabled={busy} aria-label={fill(tx("Remove {file}", "{file} 빼기"), { file: image.name })}>×</button>
                </li>
              ))}
            </ul>
          ) : null}
          {optimizing ? <p className={styles.hint} role="status">{tx("Optimizing images…", "이미지를 최적화하는 중…")}</p> : null}
        </section>
      ) : null}

      {!revisionPageId ? (
        <>
          <label className={styles.field}>
            {tx("Management title", "관리용 제목")} <span className={styles.hint}>{tx("Filled from the document title", "원본 문서 제목을 자동 입력")}</span>
            <input
              name="title"
              required
              maxLength={100}
              placeholder={tx("Select an HTML file to fill this automatically.", "HTML 파일을 선택하면 자동으로 입력됩니다.")}
              value={title}
              onChange={(event) => { titleWasEdited.current = true; setTitle(event.target.value); }}
            />
            <span className={styles.hint}>{tx("Shown in your page list and the published page's browser tab.", "내 페이지 목록과 공개 페이지의 브라우저 탭 제목에 표시됩니다.")}</span>
          </label>
          <label className={styles.field}>
            {tx("Description", "설명")} <span className={styles.hint}>{tx("Optional · up to 300 characters", "선택 · 최대 300자")}</span>
            <textarea name="description" rows={3} maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={tx("Briefly describe what this page is for.", "페이지 용도를 짧게 적어 주세요.")} />
          </label>
        </>
      ) : null}

      {preview ? (
        <section className={styles.previewBox} aria-label={tx("Page preview", "페이지 미리보기")}>
          {preview.missing.length ? (
            <div className={styles.missingNotice} role="status">
              <strong>{fill(tx("{count} images were not found: {files}", "이미지 {count}개를 찾지 못했어요: {files}"), { count: preview.missing.length, files: preview.missing.slice(0, 5).join(", ") + (preview.missing.length > 5 ? " …" : "") })}</strong>
              <span>{tx("You can still publish. Add the missing images to show them on the page.", "그대로 게시할 수도 있어요. 빠진 이미지를 추가하면 페이지에 표시됩니다.")}</span>
            </div>
          ) : null}
          <iframe title={tx("Page preview", "페이지 미리보기")} sandbox="" srcDoc={preview.html} className={styles.previewFrame} />
        </section>
      ) : null}

      {problem ? (
        <div className={styles.error} role="alert">
          <p>{problem.message}</p>
          {nextStep ? <div className={styles.errorActions}>{nextStep}</div> : null}
        </div>
      ) : null}

      {result ? (
        <div className={styles.success} role="status">
          <strong>{revisionPageId ? tx("The revised page is live.", "수정한 페이지가 게시되었습니다.") : tx("Your permanent link is ready.", "고정 링크가 만들어졌습니다.")}</strong>
          <div className={styles.publicLink}>
            <a href={result.publicUrl} target="_blank" rel="noreferrer">{result.publicUrl}</a>
            <button className={styles.copy} type="button" onClick={copyLink}>
              {copied ? tx("Copied", "복사됨") : tx("Copy link", "링크 복사")}
            </button>
          </div>
          <PageQrCode fileName={`tagworks-${result.page.slug}-qr.png`} title={result.page.title} url={result.publicUrl} locale={locale} />
          {result.missingImages.length ? (
            <p className={styles.hint}>
              {fill(tx("{count} images were not found: {files}", "이미지 {count}개를 찾지 못했어요: {files}"), { count: result.missingImages.length, files: result.missingImages.slice(0, 5).join(", ") })}{" "}
              <Link href={`/pages/new?edit=${result.page.id}`}>{tx("Upload the missing images", "빠진 이미지 올리기")}</Link>
            </p>
          ) : null}
          {result.warnings.length ? (
            <ul className={styles.warningList}>
              {result.warnings.map((warning) => <li key={warning}>{displayWarning(warning)}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      <button className={styles.submit} type="submit" disabled={busy || disabled || !preview || Boolean(problem && problem.code && problem.code !== "edit_rate")}>
        {pending === "uploading"
          ? tx("Uploading images…", "이미지 올리는 중…")
          : pending === "publishing"
            ? tx("Checking and publishing…", "안전 검사 후 게시 중…")
            : revisionPageId ? tx("Publish revision", "수정본 게시") : tx("Upload and create permanent link", "업로드하고 고정 링크 만들기")}
      </button>
    </form>
  );
}

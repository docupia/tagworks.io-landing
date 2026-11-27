import { NextResponse } from "next/server";
import { text, type Locale } from "@/lib/i18n";
import { limitMessage, type LimitCode } from "@/lib/limit-messages";
import { PublishError } from "@/lib/publish-page";

const LIMIT_CODES = new Set<string>([
  "link_limit", "custom_needed", "file_too_large", "too_many_images", "link_too_large", "edit_rate", "image_type",
]);

export class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Localized JSON error for the dashboard. Limit errors carry a code so the UI can offer the next step. */
export function publishErrorResponse(reason: unknown, locale: Locale) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  if (reason instanceof RequestError) {
    return NextResponse.json({ error: reason.message }, { status: reason.status });
  }
  if (reason instanceof PublishError) {
    let message: string;
    if (LIMIT_CODES.has(reason.code)) message = limitMessage(locale, reason.code as LimitCode, reason.values);
    else if (reason.code === "not_found") message = tx("Published page not found.", "게시된 페이지를 찾을 수 없습니다.");
    else if (reason.code === "not_utf8") message = tx("Only UTF-8 encoded HTML files can be uploaded.", "UTF-8로 저장된 HTML 파일만 업로드할 수 있습니다.");
    else if (reason.code === "invalid_html") message = tx("Choose a valid HTML document.", "올바른 HTML 문서를 선택해 주세요.");
    else message = tx("The upload took too long. Please try again.", "업로드 시간이 초과되었습니다. 다시 시도해 주세요.");
    const headers: Record<string, string> = {};
    if (reason.code === "edit_rate" && typeof reason.values.retryAfter === "number") {
      headers["Retry-After"] = String(reason.values.retryAfter);
    }
    return NextResponse.json({ error: message, code: reason.code, values: reason.values }, { status: reason.status, headers });
  }
  console.error("Page publishing failed", reason instanceof Error ? reason.message : "unknown error");
  return NextResponse.json(
    { error: tx("Could not publish the page. Please try again shortly.", "페이지를 게시하지 못했습니다. 잠시 후 다시 시도해 주세요.") },
    { status: 500 },
  );
}

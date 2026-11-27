import { text, type Locale } from "@/lib/i18n";

export type PageStatus = "draft" | "published" | "paused" | "deleted";

export function statusLabel(status: PageStatus, locale: Locale, reason?: string | null) {
  if (status === "published") return text(locale, "Published", "게시 중");
  if (status === "paused" && reason === "downgrade") return text(locale, "Private after plan change", "플랜 변경으로 비공개");
  return text(locale, "Private", "비공개");
}

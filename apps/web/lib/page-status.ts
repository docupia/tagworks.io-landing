import { text, type Locale } from "@/lib/i18n";

export type PageStatus = "draft" | "published" | "paused" | "deleted";

export function statusLabel(status: PageStatus, locale: Locale) {
  if (status === "published") return text(locale, "Published", "게시 중");
  if (status === "paused") return text(locale, "Paused", "게시 중단");
  return text(locale, "Private", "비공개");
}

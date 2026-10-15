import { translate } from "@/lib/translations";

export const LOCALE_COOKIE = "tagworks_locale";

export const LOCALES = ["en", "ja", "es", "de", "zh", "ko"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ja: "日本語",
  es: "Español",
  de: "Deutsch",
  zh: "中文",
  ko: "한국어",
};

export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en-US",
  ja: "ja-JP",
  es: "es-ES",
  de: "de-DE",
  zh: "zh-CN",
  ko: "ko-KR",
};

export function normalizeLocale(value: string | null | undefined): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : "en";
}

export function text(locale: Locale, english: string, korean: string) {
  if (locale === "en") return english;
  if (locale === "ko") return korean;
  return translate(locale, english);
}

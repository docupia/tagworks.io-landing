export const LOCALE_COOKIE = "tagworks_locale";

export type Locale = "en" | "ko";

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "ko" ? "ko" : "en";
}

export function text(locale: Locale, english: string, korean: string) {
  return locale === "ko" ? korean : english;
}

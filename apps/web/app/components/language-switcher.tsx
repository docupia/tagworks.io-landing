"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_LABELS, LOCALES, text, type Locale } from "@/lib/i18n";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();

  function select(nextLocale: Locale) {
    if (nextLocale === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <label className="language-switcher">
      <span className="sr-only">{text(locale, "Select language", "언어 선택")}</span>
      <select value={locale} onChange={(event) => select(event.target.value as Locale)}>
        {LOCALES.map((option) => (
          <option value={option} key={option}>{LOCALE_LABELS[option]}</option>
        ))}
      </select>
    </label>
  );
}

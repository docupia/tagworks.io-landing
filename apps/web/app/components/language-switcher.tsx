"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();

  function select(nextLocale: Locale) {
    if (nextLocale === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={locale === "ko" ? "언어 선택" : "Select language"}
    >
      <button
        type="button"
        className={locale === "en" ? "is-active" : undefined}
        aria-pressed={locale === "en"}
        onClick={() => select("en")}
      >
        EN
      </button>
      <button
        type="button"
        className={locale === "ko" ? "is-active" : undefined}
        aria-pressed={locale === "ko"}
        onClick={() => select("ko")}
      >
        한국어
      </button>
    </div>
  );
}

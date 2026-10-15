import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getLocale } from "@/lib/i18n-server";
import { text } from "@/lib/i18n";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: {
      default: text(locale, "TagWorks — Turn HTML into a permanent link", "TagWorks — HTML을 고정 링크로"),
      template: "%s · TagWorks",
    },
    description: text(
      locale,
      "Upload an HTML file and publish it at a permanent link you can share anywhere.",
      "HTML 파일을 업로드하고 언제든 공유할 수 있는 고정 링크를 만드세요.",
    ),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}

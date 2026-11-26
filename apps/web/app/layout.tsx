import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getLocale } from "@/lib/i18n-server";
import { brandCopy } from "@/lib/brand-copy";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const brand = brandCopy[locale];
  return {
    title: {
      default: `TagWorks — ${brand.title}`,
      template: "%s · TagWorks",
    },
    description: brand.description,
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

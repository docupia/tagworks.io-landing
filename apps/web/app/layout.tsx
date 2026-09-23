import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TagWorks — HTML을 고정 링크로",
    template: "%s · TagWorks",
  },
  description:
    "HTML 파일을 안전하게 업로드하고 언제든 공유할 수 있는 고정 링크를 만드세요.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}

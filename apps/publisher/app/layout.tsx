import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Tagworks Publisher",
  description: "Tagworks에서 발행한 페이지를 안전하게 제공하는 전용 서비스입니다.",
  robots: {
    follow: false,
    index: false,
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

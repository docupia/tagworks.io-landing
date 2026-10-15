"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import styles from "@/app/dashboard/dashboard.module.css";
import { text, type Locale } from "@/lib/i18n";

type PageQrCodeProps = {
  compact?: boolean;
  fileName: string;
  title: string;
  url: string;
  locale: Locale;
};

export function PageQrCode({ compact = false, fileName, title, url, locale }: PageQrCodeProps) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const [dataUrl, setDataUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const size = compact ? 104 : 168;

  useEffect(() => {
    let active = true;
    setDataUrl("");
    setFailed(false);

    QRCode.toDataURL(url, {
      color: { dark: "#31382aff", light: "#fffdf7ff" },
      errorCorrectionLevel: "M",
      margin: 2,
      width: 336,
    })
      .then((value) => {
        if (active) setDataUrl(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [url]);

  return (
    <div className={`${styles.qrBox} ${compact ? styles.qrCompact : ""}`}>
      {dataUrl ? (
        <Image
          className={styles.qrImage}
          src={dataUrl}
          width={size}
          height={size}
          unoptimized
          alt={tx(`QR code for ${title}`, `${title} 페이지로 연결되는 QR 코드`)}
        />
      ) : (
        <div
          className={styles.qrPlaceholder}
          style={{ width: size, height: size }}
          aria-label={failed ? tx("Could not create the QR code.", "QR 코드를 만들지 못했습니다.") : tx("Creating QR code", "QR 코드 생성 중")}
        >
          {failed ? tx("QR error", "QR 오류") : tx("Creating QR…", "QR 생성 중")}
        </div>
      )}
      <div className={styles.qrMeta}>
        <span>{compact ? tx("Page QR", "페이지 QR") : tx("Open with your phone camera", "휴대폰 카메라로 바로 열기")}</span>
        {dataUrl ? (
          <a href={dataUrl} download={fileName}>
            {tx("Download PNG", "PNG 다운로드")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

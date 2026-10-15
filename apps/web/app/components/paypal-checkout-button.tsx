"use client";

import { useState } from "react";
import { text, type Locale } from "@/lib/i18n";

export function PayPalCheckoutButton({
  plan,
  locale,
  label,
  className,
}: {
  plan: "monthly" | "prepaid";
  locale: Locale;
  label: string;
  className?: string;
}) {
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/paypal/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = await response.json() as { approvalUrl?: string; error?: string };
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok || !body.approvalUrl) {
        throw new Error(body.error || tx("Could not start PayPal checkout.", "PayPal 결제를 시작하지 못했습니다."));
      }
      window.location.assign(body.approvalUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tx("Could not start PayPal checkout.", "PayPal 결제를 시작하지 못했습니다."));
      setPending(false);
    }
  }

  return (
    <div>
      <button className={className} type="button" onClick={checkout} disabled={pending}>
        <span>{pending ? tx("Opening PayPal…", "PayPal 여는 중…") : label}</span>
        <strong aria-label="PayPal">PayPal</strong>
      </button>
      {error ? <p role="alert" style={{ color: "#8b4238", fontSize: ".78rem", lineHeight: 1.45 }}>{error}</p> : null}
    </div>
  );
}

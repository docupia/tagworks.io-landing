"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isCountedSitePath } from "@/lib/site-visits";

let sent = false;

// Reports the visitor once per page load, on the first public page they open.
export function SiteVisitBeacon() {
  const pathname = usePathname() ?? "/";
  useEffect(() => {
    if (sent || !isCountedSitePath(pathname)) return;
    sent = true;
    fetch("/api/site-visits", { method: "POST", keepalive: true, credentials: "same-origin" }).catch(() => {});
  }, [pathname]);
  return null;
}

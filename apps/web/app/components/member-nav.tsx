"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./member-shell.module.css";

type NavIcon = "pages" | "api" | "plans" | "affiliate";
type NavItem = { href: string; label: string; icon: NavIcon };

const icons: Record<NavIcon, ReactNode> = {
  pages: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />,
  api: <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />,
  plans: <path d="M4 7h16v11H4zM4 11h16M8 15h3" />,
  affiliate: <path d="M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 2.2-5 5-5s5 2 5 5M13.5 15.4c.8-.3 1.6-.4 2.5-.4 2.8 0 5 2 5 5" />,
};

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname.startsWith("/pages/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MemberNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname() ?? "";
  return <nav className={styles.nav} aria-label={label}>
    {items.map((item) => {
      const active = isActive(pathname, item.href);
      return <Link key={item.href} href={item.href} className={styles.navLink} aria-current={active ? "page" : undefined}>
        <svg className={styles.navIcon} viewBox="0 0 24 24" aria-hidden="true">{icons[item.icon]}</svg>
        <span>{item.label}</span>
      </Link>;
    })}
  </nav>;
}

export function MemberAccountMenu({ children, initial, label }: { children: ReactNode; initial: string; label: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    function close(event: PointerEvent | KeyboardEvent) {
      const menu = ref.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menu.contains(event.target as Node)) menu.open = false;
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return <details ref={ref} className={styles.account}>
    <summary aria-label={label}><span aria-hidden="true">{initial}</span></summary>
    <div className={styles.accountPanel}>{children}</div>
  </details>;
}

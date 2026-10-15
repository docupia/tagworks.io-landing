"use client";

import { useFormStatus } from "react-dom";
import styles from "@/app/auth.module.css";

export function AuthSubmitButton({ children, pendingLabel = "Working…" }: { children: React.ReactNode; pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <button className={styles.submit} type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

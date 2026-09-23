"use client";

import { useFormStatus } from "react-dom";
import styles from "@/app/auth.module.css";

export function AuthSubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button className={styles.submit} type="submit" disabled={pending}>
      {pending ? "처리 중…" : children}
    </button>
  );
}

import type { ReactNode } from "react";
import { MemberShell } from "@/app/components/member-shell";

export default function Layout({ children }: { children: ReactNode }) {
  return <MemberShell>{children}</MemberShell>;
}

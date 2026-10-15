"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";
import { text } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
};

const withMessage = (path: string, key: "error" | "message", message: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;

const safeNext = (formData: FormData) => {
  const next = field(formData, "next");
  return next === "/billing" ? next : "/dashboard";
};

export async function signIn(formData: FormData) {
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  const next = safeNext(formData);
  const loginPath = next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  if (!email || !password) {
    redirect(withMessage(loginPath, "error", tx("Enter your email and password.", "이메일과 비밀번호를 입력해 주세요.")));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(withMessage(loginPath, "error", tx("Check your email and password.", "로그인 정보를 확인해 주세요.")));
  }

  redirect(next);
}

export async function signUp(formData: FormData) {
  const locale = await getLocale();
  const tx = (english: string, korean: string) => text(locale, english, korean);
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  const passwordConfirm = field(formData, "passwordConfirm");

  if (!email || email.length > 254) {
    redirect(withMessage("/signup", "error", tx("Enter a valid email address.", "올바른 이메일을 입력해 주세요.")));
  }
  if (password.length < 8) {
    redirect(withMessage("/signup", "error", tx("Your password must be at least 8 characters.", "비밀번호는 8자 이상이어야 합니다.")));
  }
  if (password !== passwordConfirm) {
    redirect(withMessage("/signup", "error", tx("The passwords do not match.", "비밀번호가 서로 다릅니다.")));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    if (
      error.code === "email_address_not_authorized" ||
      error.code === "over_email_send_rate_limit"
    ) {
      redirect(
        withMessage(
          "/signup",
          "error",
          tx("Email verification is temporarily unavailable. Please try again shortly.", "인증 메일 발송 설정이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요."),
        ),
      );
    }

    redirect(withMessage("/signup", "error", tx("We could not create your account. Please try again shortly.", "회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.")));
  }

  if (data.session) redirect("/dashboard");

  redirect(
    withMessage(
      "/login",
      "message",
      tx("We sent a confirmation email. Open its link, then log in.", "확인 이메일을 보냈습니다. 이메일의 링크를 연 뒤 로그인해 주세요."),
    ),
  );
}

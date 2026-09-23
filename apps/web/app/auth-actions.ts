"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
};

const withMessage = (path: string, key: "error" | "message", message: string) =>
  `${path}?${key}=${encodeURIComponent(message)}`;

export async function signIn(formData: FormData) {
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");

  if (!email || !password) {
    redirect(withMessage("/login", "error", "이메일과 비밀번호를 입력해 주세요."));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(withMessage("/login", "error", "로그인 정보를 확인해 주세요."));
  }

  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  const passwordConfirm = field(formData, "passwordConfirm");

  if (!email || email.length > 254) {
    redirect(withMessage("/signup", "error", "올바른 이메일을 입력해 주세요."));
  }
  if (password.length < 8) {
    redirect(withMessage("/signup", "error", "비밀번호는 8자 이상이어야 합니다."));
  }
  if (password !== passwordConfirm) {
    redirect(withMessage("/signup", "error", "비밀번호가 서로 다릅니다."));
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
          "인증 메일 발송 설정이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.",
        ),
      );
    }

    redirect(withMessage("/signup", "error", "회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."));
  }

  if (data.session) redirect("/dashboard");

  redirect(
    withMessage(
      "/login",
      "message",
      "확인 이메일을 보냈습니다. 이메일의 링크를 연 뒤 로그인해 주세요.",
    ),
  );
}

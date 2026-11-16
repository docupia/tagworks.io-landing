import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, normalizeLocale, text } from "@/lib/i18n";

export async function GET(request: NextRequest) {
  const locale = normalizeLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  const code = request.nextUrl.searchParams.get("code");
  const requestedNext = request.nextUrl.searchParams.get("next");
  const allowedDestinations = new Set(["/dashboard", "/pages/new", "/billing"]);
  const next = requestedNext && allowedDestinations.has(requestedNext)
    ? requestedNext
    : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  const flow = request.nextUrl.searchParams.get("flow");
  const google = flow === "google-login" || flow === "google-signup";
  const target = new URL(flow === "google-signup" ? "/signup" : "/login", request.url);
  if (flow === "google-login" && next === "/billing") target.searchParams.set("next", next);
  if (google) {
    target.searchParams.set("error", text(locale, "Google sign-in did not complete. Try again.", "Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요."));
    return NextResponse.redirect(target);
  }
  target.searchParams.set("error", text(locale, "The confirmation link is invalid or has expired.", "인증 링크가 만료되었거나 올바르지 않습니다."));
  return NextResponse.redirect(target);
}

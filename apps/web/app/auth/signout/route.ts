import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, normalizeLocale, text } from "@/lib/i18n";
import { isSameOriginMutation } from "@/lib/request-security";

export async function POST(request: NextRequest) {
  const locale = normalizeLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: text(locale, "This request is not allowed.", "허용되지 않은 요청입니다.") }, { status: 403 });
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}

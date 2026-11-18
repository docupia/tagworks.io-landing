import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getDatabase } from "@/lib/database";

export const REFERRAL_COOKIE = "tagworks-ref";
export const REFERRAL_CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function affiliateUser() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  return user;
}

export async function affiliateAdmin() {
  const user = await affiliateUser();
  if (user.email?.toLowerCase() !== "docupia@gmail.com" || !user.email_confirmed_at) {
    throw new Error("관리자 권한이 필요합니다.");
  }
  return user;
}

export async function attachReferral(memberId: string) {
  const code = (await cookies()).get(REFERRAL_COOKIE)?.value;
  if (!code || !REFERRAL_CODE.test(code)) return;
  const sql = getDatabase();
  await sql`select public.attach_affiliate(${memberId}::uuid,${code}::uuid)`;
}

"use server";

import { revalidatePath } from "next/cache";
import { affiliateAdmin, affiliateUser } from "@/lib/affiliates";
import { getDatabase } from "@/lib/database";

export async function applyAffiliate(data: FormData) {
  const user = await affiliateUser();
  const email = String(data.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("유효한 PayPal 수취 이메일을 입력해 주세요.");
  }
  const sql = getDatabase();
  await sql`insert into public.affiliates(owner_id,paypal_email)
    values(${user.id}::uuid,${email})
    on conflict(owner_id) do update set paypal_email=excluded.paypal_email`;
  revalidatePath("/dashboard/affiliates");
}

export async function recordAffiliatePayout(data: FormData) {
  await affiliateAdmin();
  const owner = String(data.get("owner") ?? "");
  const month = String(data.get("month") ?? "");
  const currency = String(data.get("currency") ?? "");
  const reference = String(data.get("reference") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/.test(owner) || !/^\d{4}-\d{2}-01$/.test(month) ||
      !/^[A-Z]{3}$/.test(currency) ||
      !reference || reference.length > 200 || data.get("confirmed") !== "yes") {
    throw new Error("지급 정보와 지급 완료 확인을 입력해 주세요.");
  }
  const sql = getDatabase();
  await sql.begin(async transaction => {
    const tx = transaction as unknown as typeof sql;
    // Serialize payouts for this affiliate, including concurrent monthly records.
    const [account] = await tx`select owner_id from public.affiliates
      where owner_id=${owner}::uuid and status='approved' for update`;
    if (!account) throw new Error("승인된 계정을 선택해 주세요.");
    const recorded = await tx`insert into public.affiliate_settlements(
      affiliate_id,month,currency,amount,paypal_email,payment_reference)
      select a.owner_id,c.month,c.currency,c.balance,a.paypal_email,${reference}
      from public.affiliates a
      join public.affiliate_balances c on c.affiliate_id=a.owner_id
      where a.owner_id=${owner}::uuid
        and c.month=${month}::date and c.currency=${currency} and c.balance > 0
        and c.month < date_trunc('month',now() at time zone 'UTC')::date
        and not exists (
          select 1 from public.affiliate_settlements later
          where later.affiliate_id=a.owner_id and later.currency=c.currency
            and later.month >= c.month
        )
      returning id`;
    if (!recorded.length) throw new Error("이월 잔액을 반영한 지급 가능 수당이 없거나 이미 정산한 월입니다.");
  });
  revalidatePath("/dashboard/affiliates");
}

export async function reviewAffiliate(data: FormData) {
  await affiliateAdmin();
  const owner = String(data.get("owner") ?? "");
  const status = String(data.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(owner) || !["approved", "rejected"].includes(status)) {
    throw new Error("올바른 신청을 선택해 주세요.");
  }
  const sql = getDatabase();
  await sql`update public.affiliates set status=${status} where owner_id=${owner}::uuid`;
  revalidatePath("/dashboard/affiliates");
}

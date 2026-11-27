"use server";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getReconciledAccountPlan, getAccountPlan } from "@/lib/account-plan";
import { getSuperAdmin, INQUIRY_STATUSES, parseCustomPlanForm } from "@/lib/admin";
import { syncSubscriptionFromPayPal } from "@/lib/billing";
import { getDatabase } from "@/lib/database";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function updateInquiry(data: FormData) {
  const admin = await getSuperAdmin();
  if (!admin) notFound();
  const id = String(data.get("id") ?? "");
  const status = String(data.get("status") ?? "");
  if (!UUID.test(id) || !(INQUIRY_STATUSES as readonly string[]).includes(status)) redirect("/admin?error=invalid");
  const note = String(data.get("note") ?? "").slice(0, 2000);
  const sql = getDatabase();
  await sql`select public.admin_update_inquiry(${admin.id}::uuid, ${id}::uuid, ${status}, ${note})`;
  revalidatePath("/admin");
  redirect("/admin?saved=inquiry");
}

export async function setCustomPlan(data: FormData) {
  const admin = await getSuperAdmin();
  if (!admin) notFound();
  const ownerId = String(data.get("owner_id") ?? "");
  const email = String(data.get("email") ?? "");
  const back = `/admin?email=${encodeURIComponent(email)}`;
  if (!UUID.test(ownerId)) redirect(`${back}&error=invalid`);
  const parsed = parseCustomPlanForm(data);
  if (!parsed.ok) redirect(`${back}&error=invalid`);
  const input = parsed.value;

  const sql = getDatabase();
  await sql`
    select public.admin_set_custom_plan(
      ${admin.id}::uuid, ${ownerId}::uuid, ${input.plan},
      ${input.maxLinks}::integer, ${input.monthlyViews}::integer,
      ${input.priceUsd}::numeric, ${input.note}
    )
  `;
  if (input.plan === "free") {
    // Re-apply a PayPal subscription the account still has, if any.
    const account = await getAccountPlan(ownerId);
    if (account.paypalSubscriptionId) {
      await syncSubscriptionFromPayPal(account.paypalSubscriptionId).catch((error) => {
        console.error("Could not re-sync the PayPal subscription.", error instanceof Error ? error.message : error);
      });
    }
  }
  await getReconciledAccountPlan(ownerId);
  revalidatePath("/admin");
  redirect(`${back}&saved=plan`);
}

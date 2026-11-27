"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccountPlan } from "@/lib/account-plan";
import { getDatabase } from "@/lib/database";
import { PAGE_ID_PATTERN } from "@/lib/page-revisions";
import { createClient } from "@/lib/supabase/server";

/** Publishes or unpublishes one of the owner's links. Unpublishing frees a slot. */
export async function setPageLive(data: FormData) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect("/login");
  const pageId = String(data.get("pageId") ?? "");
  const live = data.get("live") === "1";
  if (!PAGE_ID_PATTERN.test(pageId)) redirect("/dashboard");

  const account = await getAccountPlan(user.id);
  const [row] = await getDatabase()<{ result: string }[]>`
    select public.set_page_live(${user.id}::uuid, ${pageId}::uuid, ${live}, ${account.limits.maxLinks}) as result
  `;
  revalidatePath("/dashboard");
  if (row?.result === "limit") redirect("/dashboard?notice=link_limit");
  redirect(`/dashboard?notice=${live ? "published" : "unpublished"}`);
}

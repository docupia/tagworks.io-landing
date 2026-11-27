"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccountPlan } from "@/lib/account-plan";
import { keepLinksOnDowngrade } from "@/lib/billing";
import { PAGE_ID_PATTERN } from "@/lib/page-revisions";
import { PLANS, type PlanId } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";

/** Saves which links stay public when the scheduled plan change takes effect. */
export async function saveKeptLinks(data: FormData) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect("/login");
  const account = await getAccountPlan(user.id);
  const target: PlanId = account.pendingPlan ?? "free";
  const ids = data.getAll("keep").map(String).filter((id) => PAGE_ID_PATTERN.test(id));
  if (ids.length > PLANS[target].maxLinks) redirect("/billing?kept=too_many");
  await keepLinksOnDowngrade(user.id, ids);
  revalidatePath("/billing");
  redirect("/billing?kept=saved");
}

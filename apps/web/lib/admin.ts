import { getAccountPlan } from "@/lib/account-plan";
import { getCurrentUser } from "@/lib/current-user";

/** Returns the signed-in super administrator, or null for everyone else. */
export async function getSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  const account = await getAccountPlan(user.id);
  return account.superAdmin ? user : null;
}

export const INQUIRY_STATUSES = ["new", "contacted", "won", "closed"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export type CustomPlanInput = {
  plan: "custom" | "free";
  maxLinks: number | null;
  monthlyViews: number | null;
  priceUsd: number | null;
  note: string;
};

const optionalNumber = (value: FormDataEntryValue | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

/** Validates the admin custom-plan form. */
export function parseCustomPlanForm(data: FormData): { ok: true; value: CustomPlanInput } | { ok: false } {
  const plan = data.get("plan") === "free" ? "free" : "custom";
  const maxLinks = optionalNumber(data.get("max_links"));
  const monthlyViews = optionalNumber(data.get("monthly_views"));
  const priceUsd = optionalNumber(data.get("price_usd"));
  const note = String(data.get("note") ?? "").trim().slice(0, 2000);
  if (plan === "custom") {
    if (maxLinks === null || !Number.isInteger(maxLinks) || maxLinks < 1 || maxLinks > 100_000) return { ok: false };
    if (monthlyViews !== null && (!Number.isInteger(monthlyViews) || monthlyViews < 0 || monthlyViews > 2_000_000_000)) return { ok: false };
    if (priceUsd !== null && (Number.isNaN(priceUsd) || priceUsd < 0 || priceUsd > 1_000_000)) return { ok: false };
  }
  return {
    ok: true,
    value: plan === "custom"
      ? { plan, maxLinks, monthlyViews, priceUsd: priceUsd === null ? null : Math.round(priceUsd * 100) / 100, note }
      : { plan, maxLinks: null, monthlyViews: null, priceUsd: null, note },
  };
}

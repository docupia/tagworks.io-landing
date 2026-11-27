import { getDatabase } from "@/lib/database";
import {
  isPlanId,
  parsePlanOverrides,
  resolveLimits,
  type PlanId,
  type PlanOverrides,
  type ResolvedLimits,
} from "@/lib/plans";

export type AccountPlan = {
  /** Plan stored on the account (what PayPal or an admin last set). */
  storedPlan: PlanId;
  /** Plan whose limits apply right now. */
  plan: PlanId;
  overrides: PlanOverrides;
  superAdmin: boolean;
  subscriptionStatus: string | null;
  subscriptionPeriodEnd: string | null;
  paypalSubscriptionId: string | null;
  paypalPlanId: string | null;
  pendingPlan: PlanId | null;
  graceUntil: string | null;
  customPriceUsd: number | null;
  liveLinks: number;
  limits: ResolvedLimits;
};

type AccountPlanRow = {
  plan: string;
  effective_plan: string;
  plan_overrides: unknown;
  is_super_admin: boolean;
  subscription_status: string | null;
  subscription_period_end: Date | string | null;
  paypal_subscription_id: string | null;
  paypal_subscription_plan_id: string | null;
  pending_plan: string | null;
  grace_until: Date | string | null;
  custom_price_usd: string | number | null;
  live_links: number;
};

const asIso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);

export function accountPlanFromRow(row: AccountPlanRow): AccountPlan {
  const plan = isPlanId(row.effective_plan) ? row.effective_plan : "free";
  const overrides = parsePlanOverrides(row.plan_overrides);
  return {
    storedPlan: isPlanId(row.plan) ? row.plan : "free",
    plan,
    overrides,
    superAdmin: row.is_super_admin,
    subscriptionStatus: row.subscription_status,
    subscriptionPeriodEnd: asIso(row.subscription_period_end),
    paypalSubscriptionId: row.paypal_subscription_id,
    paypalPlanId: row.paypal_subscription_plan_id,
    pendingPlan: isPlanId(row.pending_plan) ? row.pending_plan : null,
    graceUntil: asIso(row.grace_until),
    customPriceUsd: row.custom_price_usd === null ? null : Number(row.custom_price_usd),
    liveLinks: Number(row.live_links),
    limits: resolveLimits(plan, overrides, { superAdmin: row.is_super_admin }),
  };
}

export async function getAccountPlan(ownerId: string): Promise<AccountPlan> {
  const sql = getDatabase();
  const [row] = await sql<AccountPlanRow[]>`
    select * from public.get_account_plan(${ownerId}::uuid)
  `;
  if (!row) throw new Error("Could not load the account plan.");
  return accountPlanFromRow(row);
}

/** Limits that apply to the account right now. */
export async function getLimits(ownerId: string) {
  return (await getAccountPlan(ownerId)).limits;
}

/**
 * Brings live links in line with the current plan: closes extra links after
 * a downgrade and reopens downgrade-closed links once there is room again.
 * Safe to call repeatedly.
 */
export async function reconcileLiveLinks(ownerId: string, account?: AccountPlan) {
  const current = account ?? (await getAccountPlan(ownerId));
  const sql = getDatabase();
  const [row] = await sql<{ closed: number; restored: number }[]>`
    select * from public.reconcile_live_links(${ownerId}::uuid, ${current.limits.maxLinks})
  `;
  return { closed: Number(row?.closed ?? 0), restored: Number(row?.restored ?? 0) };
}

/** Loads the plan and reconciles live links, returning the fresh state. */
export async function getReconciledAccountPlan(ownerId: string) {
  const account = await getAccountPlan(ownerId);
  const result = await reconcileLiveLinks(ownerId, account);
  if (!result.closed && !result.restored) return account;
  return getAccountPlan(ownerId);
}

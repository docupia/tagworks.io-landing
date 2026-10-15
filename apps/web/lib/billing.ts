import { getDatabase } from "@/lib/database";

export type UploadEntitlement = {
  tier: "free" | "monthly" | "prepaid";
  paidCustomer: boolean;
  subscriptionStatus: string | null;
  subscriptionPeriodEnd: string | null;
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  prepaidGranted: number;
  prepaidRemaining: number;
  freeRemaining: number;
  totalRemaining: number;
  canUpload: boolean;
};

type EntitlementRow = {
  tier: UploadEntitlement["tier"];
  paid_customer: boolean;
  subscription_status: string | null;
  subscription_period_end: Date | string | null;
  monthly_limit: number;
  monthly_used: number;
  monthly_remaining: number;
  prepaid_granted: number;
  prepaid_remaining: number;
  free_remaining: number;
  total_remaining: number;
  can_upload: boolean;
};

const asIso = (value: Date | string | null) =>
  value ? new Date(value).toISOString() : null;

export async function getUploadEntitlement(ownerId: string): Promise<UploadEntitlement> {
  const sql = getDatabase();
  const [row] = await sql<EntitlementRow[]>`
    select * from public.get_upload_entitlement(${ownerId}::uuid)
  `;
  if (!row) throw new Error("Could not load the upload entitlement.");

  return {
    tier: row.tier,
    paidCustomer: row.paid_customer,
    subscriptionStatus: row.subscription_status,
    subscriptionPeriodEnd: asIso(row.subscription_period_end),
    monthlyLimit: Number(row.monthly_limit),
    monthlyUsed: Number(row.monthly_used),
    monthlyRemaining: Number(row.monthly_remaining),
    prepaidGranted: Number(row.prepaid_granted),
    prepaidRemaining: Number(row.prepaid_remaining),
    freeRemaining: Number(row.free_remaining),
    totalRemaining: Number(row.total_remaining),
    canUpload: row.can_upload,
  };
}

export async function reserveUploadQuota(
  ownerId: string,
  reservationId: string,
  objectPath: string,
) {
  const sql = getDatabase();
  const [row] = await sql<{
    allowed: boolean;
    quota_source: string | null;
    total_remaining: number;
  }[]>`
    select * from public.reserve_upload_quota(
      ${ownerId}::uuid,
      ${reservationId}::uuid,
      ${objectPath}
    )
  `;
  return {
    allowed: row?.allowed === true,
    source: row?.quota_source ?? null,
    remaining: Number(row?.total_remaining ?? 0),
  };
}

export async function releaseUploadQuota(ownerId: string, reservationId: string) {
  const sql = getDatabase();
  await sql`
    select public.release_upload_quota(${ownerId}::uuid, ${reservationId}::uuid)
  `;
}

export async function consumeUploadQuota(ownerId: string, reservationId: string) {
  const sql = getDatabase();
  const [row] = await sql<{ consumed: boolean }[]>`
    select public.consume_upload_quota(
      ${ownerId}::uuid,
      ${reservationId}::uuid
    ) as consumed
  `;
  if (!row?.consumed) throw new Error("The upload reservation expired before publishing.");
}

export type CompletedCreditPack = {
  ownerId: string;
  orderId: string;
  captureId: string;
  payerId: string | null;
  amount: string;
  currencyCode: string;
  completedAt: string;
};

export async function grantPayPalCreditPack(payment: CompletedCreditPack) {
  const sql = getDatabase();
  const [row] = await sql<{ applied: boolean; prepaid_remaining: number }[]>`
    select * from public.grant_paypal_prepaid_pack(
      ${payment.ownerId}::uuid,
      ${payment.orderId},
      ${payment.captureId},
      ${payment.payerId},
      ${payment.amount}::numeric,
      ${payment.currencyCode},
      ${payment.completedAt}::timestamptz
    )
  `;
  return {
    applied: row?.applied === true,
    prepaidRemaining: Number(row?.prepaid_remaining ?? 0),
  };
}

export type PayPalSubscriptionState = {
  ownerId: string;
  subscriptionId: string;
  planId: string;
  payerId: string | null;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  statusUpdatedAt: string;
};

export async function syncPayPalSubscription(state: PayPalSubscriptionState) {
  const sql = getDatabase();
  await sql`
    select public.sync_paypal_subscription(
      ${state.ownerId}::uuid,
      ${state.subscriptionId},
      ${state.planId},
      ${state.payerId},
      ${state.status},
      ${state.periodStart}::timestamptz,
      ${state.periodEnd}::timestamptz,
      ${state.statusUpdatedAt}::timestamptz
    )
  `;
}

export async function recordPayPalWebhookEvent(event: {
  id: string;
  type: string;
  resourceId: string | null;
  occurredAt: string | null;
}) {
  const sql = getDatabase();
  await sql`
    select public.record_paypal_webhook_event(
      ${event.id},
      ${event.type},
      ${event.resourceId},
      ${event.occurredAt}::timestamptz
    )
  `;
}

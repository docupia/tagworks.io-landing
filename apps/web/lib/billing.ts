import { reconcileLiveLinks } from "@/lib/account-plan";
import { getDatabase } from "@/lib/database";
import { getPayPalSubscription, paidPlanForPayPalPlan, subscriptionState } from "@/lib/paypal";

/**
 * Fetches a subscription from PayPal and applies it to the owner's plan.
 * Returns the new status, or null when the subscription is not one of ours.
 * Always reads PayPal's current state, so repeated or out-of-order webhooks
 * end in the same result.
 */
export async function syncSubscriptionFromPayPal(subscriptionId: string, observedAt?: string) {
  const subscription = await getPayPalSubscription(subscriptionId);
  const paid = paidPlanForPayPalPlan(subscription.plan_id);
  if (!paid) return null;
  const state = subscriptionState(subscription, observedAt);
  if (!state) return null;

  const sql = getDatabase();
  await sql`
    select public.sync_paypal_plan(
      ${state.ownerId}::uuid,
      ${state.subscriptionId},
      ${state.planId},
      ${paid.plan},
      ${paid.interval},
      ${state.payerId},
      ${state.status},
      ${state.periodStart}::timestamptz,
      ${state.periodEnd}::timestamptz,
      ${state.statusUpdatedAt}::timestamptz
    )
  `;
  // Reopen links closed by an earlier downgrade, or close extras.
  await reconcileLiveLinks(state.ownerId);
  return { ownerId: state.ownerId, status: state.status, plan: paid.plan };
}

export async function markPaymentFailed(subscriptionId: string) {
  const sql = getDatabase();
  await sql`select public.mark_paypal_payment_failed(${subscriptionId})`;
}

export async function webhookEventSeen(eventId: string) {
  const sql = getDatabase();
  const [row] = await sql<{ seen: boolean }[]>`select public.paypal_webhook_event_seen(${eventId}) as seen`;
  return row?.seen === true;
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

/** Chooses which live links stay public when a downgrade takes effect. */
export async function keepLinksOnDowngrade(ownerId: string, pageIds: string[]) {
  const sql = getDatabase();
  await sql`select public.set_links_kept_on_downgrade(${ownerId}::uuid, ${pageIds}::uuid[])`;
}

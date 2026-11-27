import { timingSafeEqual } from "node:crypto";
import { getAccountPlan, getReconciledAccountPlan } from "@/lib/account-plan";
import { getDatabase } from "@/lib/database";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/env";
import { refreshMonthlyUsage } from "@/lib/monthly-usage";
import { isPlanId, PLANS } from "@/lib/plans";

/** Constant-time check of the `Authorization: Bearer <CRON_SECRET>` header. */
export function isAuthorizedCron(header: string | null, secret: string | null) {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

type PlanChangeRow = {
  owner_id: string;
  email: string;
  current_plan: string;
  next_plan: string;
  change_at: Date;
  live_links: number;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * The daily job sends each reminder once: the 7-day reminder when the change
 * is between 6 and 7 days away, the 1-day reminder when it is under a day away.
 */
export function reminderFor(changeAt: Date, now = new Date()): 7 | 1 | null {
  const left = changeAt.getTime() - now.getTime();
  if (left > 6 * DAY && left <= 7 * DAY) return 7;
  if (left > 0 && left <= DAY) return 1;
  return null;
}

export function planChangeEmail(row: PlanChangeRow, days: 7 | 1, siteUrl: string) {
  const next = isPlanId(row.next_plan) ? PLANS[row.next_plan] : PLANS.free;
  const current = isPlanId(row.current_plan) ? PLANS[row.current_plan].name : row.current_plan;
  const extra = Math.max(0, row.live_links - next.maxLinks);
  const when = days === 7 ? "in 7 days" : "tomorrow";
  return {
    to: row.email,
    subject: `Your TagWorks plan changes to ${next.name} ${when}`,
    text: [
      `Your plan changes from ${current} to ${next.name} on ${row.change_at.toISOString().slice(0, 10)}.`,
      extra > 0
        ? `${next.name} includes ${next.maxLinks} live link${next.maxLinks === 1 ? "" : "s"}. ${extra} of your ${row.live_links} links will become private (not deleted). You can choose which links stay public on the Plans page. Links come back at the same URL if you upgrade again.`
        : "All of your live links fit in the new plan.",
      `${siteUrl}/billing`,
      "",
      `TagWorks 플랜이 ${row.change_at.toISOString().slice(0, 10)}에 ${current}에서 ${next.name}(으)로 바뀝니다.`,
      extra > 0
        ? `공개 링크 ${row.live_links}개 중 ${extra}개가 비공개로 바뀌어요(삭제되지 않아요). 플랜 화면에서 공개로 남길 링크를 고를 수 있어요.`
        : "현재 공개 링크는 모두 새 플랜에 포함돼요.",
    ].join("\n"),
  };
}

export async function runDailyJobs(now = new Date()) {
  const sql = getDatabase();
  const result = { reconciled: 0, reminders: 0, usageChecked: 0, errors: 0 };

  // 1. Make extra links private for accounts whose paid period has ended.
  const ended = await sql<{ owner_id: string }[]>`select * from public.owners_needing_reconcile(1000)`;
  for (const row of ended) {
    try {
      await getReconciledAccountPlan(row.owner_id);
      result.reconciled += 1;
    } catch {
      result.errors += 1;
    }
  }

  // 2. Remind owners 7 days and 1 day before a downgrade or cancellation.
  const changes = await sql<PlanChangeRow[]>`select * from public.upcoming_plan_changes(7)`;
  for (const row of changes) {
    const days = reminderFor(new Date(row.change_at), now);
    if (!days || !row.email) continue;
    if (await sendEmail(planChangeEmail({ ...row, change_at: new Date(row.change_at) }, days, getSiteUrl()))) {
      result.reminders += 1;
    }
  }

  // 3. Recount monthly page views and send fair-use notices.
  const owners = await sql<{ owner_id: string; email: string | null }[]>`
    select * from public.owners_with_views_this_month(2000)
  `;
  for (const row of owners) {
    try {
      const account = await getAccountPlan(row.owner_id);
      await refreshMonthlyUsage(row.owner_id, account, { ownerEmail: row.email });
      result.usageChecked += 1;
    } catch {
      result.errors += 1;
    }
  }
  return result;
}

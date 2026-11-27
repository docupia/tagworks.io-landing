import type { AccountPlan } from "@/lib/account-plan";
import { getDatabase } from "@/lib/database";
import { sendAdminEmail, sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/env";
import { LOCALE_TAGS, text, type Locale } from "@/lib/i18n";
import { fill } from "@/lib/plans";

export const USAGE_THRESHOLDS = [80, 100, 300] as const;

export type MonthlyUsage = {
  pageViews: number;
  limit: number;
  percent: number;
};

type UsageRow = {
  page_views: string | number;
  percent: number;
  newly_crossed: number[];
  notified: number[];
};

/** Which notice the dashboard shows: none below 80%, then 80 or 100. */
export function usageNoticeLevel(usage: Pick<MonthlyUsage, "percent" | "limit">): 0 | 80 | 100 {
  if (usage.limit <= 0) return 0;
  if (usage.percent >= 100) return 100;
  if (usage.percent >= 80) return 80;
  return 0;
}

export function ownerUsageEmail(locale: Locale, threshold: number, usage: MonthlyUsage, planName: string) {
  const number = new Intl.NumberFormat(LOCALE_TAGS[locale]);
  const values = { percent: usage.percent, views: number.format(usage.pageViews), limit: number.format(usage.limit), plan: planName };
  const subject = threshold >= 100
    ? fill(text(locale, "Your TagWorks pages passed this month's {limit} views", "TagWorks 페이지가 이번 달 조회수 {limit}회를 넘었어요"), values)
    : fill(text(locale, "Your TagWorks pages reached {percent}% of this month's views", "TagWorks 페이지가 이번 달 조회수의 {percent}%에 도달했어요"), values);
  const body = [
    fill(text(locale, "Your pages have {views} views this month, {percent}% of the {limit} included in {plan}.", "이번 달 페이지 조회수는 {views}회로, {plan}에 포함된 {limit}회의 {percent}%예요."), values),
    text(locale, "Your pages stay online. Nothing is blocked or charged automatically.", "페이지는 계속 공개돼요. 자동으로 차단하거나 추가 요금을 받지 않아요."),
    threshold >= 100
      ? text(locale, "If traffic like this continues, consider a larger plan or contact us for a custom plan.", "이런 트래픽이 계속되면 더 큰 플랜이나 Custom 플랜 문의를 고려해 주세요.")
      : text(locale, "This is just a heads-up so you can plan ahead.", "미리 알려드리는 안내예요."),
    `${getSiteUrl()}/billing`,
  ].join("\n\n");
  return { subject, text: body };
}

/**
 * Recounts this month's page views and sends each notice once a month:
 * the owner at 80% and 100%, the administrator at 300%. Super administrator
 * accounts are not counted. Public pages are never blocked.
 */
export async function refreshMonthlyUsage(
  ownerId: string,
  account: AccountPlan,
  options: { ownerEmail?: string | null; locale?: Locale; fetcher?: typeof fetch } = {},
): Promise<MonthlyUsage | null> {
  if (account.superAdmin) return null;
  const limit = account.limits.monthlyViews;
  const sql = getDatabase();
  const [row] = await sql<UsageRow[]>`
    select * from public.refresh_monthly_usage(${ownerId}::uuid, ${limit}::integer)
  `;
  if (!row) return null;
  const usage = { pageViews: Number(row.page_views), limit, percent: row.percent };
  const crossed = row.newly_crossed ?? [];
  const locale = options.locale ?? "en";

  // One email to the owner for the highest new threshold (80 or 100).
  const ownerThreshold = Math.max(0, ...crossed.filter((value) => value <= 100));
  if (ownerThreshold && options.ownerEmail) {
    await sendEmail({ to: options.ownerEmail, ...ownerUsageEmail(locale, ownerThreshold, usage, account.limits.name) }, options.fetcher);
  }
  if (crossed.includes(300)) {
    await sendAdminEmail({
      subject: `[TagWorks] Page views at ${usage.percent}% for ${options.ownerEmail ?? ownerId}`,
      text: [
        `Account: ${options.ownerEmail ?? "(no email)"} (${ownerId})`,
        `Plan: ${account.limits.name}`,
        `Page views this month: ${usage.pageViews} of ${usage.limit} (${usage.percent}%)`,
        "Pages are not blocked. Consider reaching out about a custom plan.",
        `${getSiteUrl()}/admin`,
      ].join("\n"),
    }, options.fetcher);
  }
  return usage;
}

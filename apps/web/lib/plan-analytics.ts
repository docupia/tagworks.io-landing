import { parsePageAnalytics, rangesForPlan, type AnalyticsRangeDays } from "@/lib/analytics";
import { getDatabase } from "@/lib/database";
import type { ResolvedLimits } from "@/lib/plans";

/** The requested range if the plan allows it, otherwise the plan's longest range. */
export function allowedRange(requested: AnalyticsRangeDays, limits: Pick<ResolvedLimits, "analyticsMaxDays">) {
  const ranges = rangesForPlan(limits.analyticsMaxDays);
  return ranges.includes(requested) ? requested : (ranges.at(-1) ?? 30);
}

/**
 * Reads one page's analytics with the plan's access level. The database
 * function strips full-only data, so basic plans never receive it.
 */
export async function loadPageAnalytics(
  ownerId: string,
  pageId: string,
  requested: AnalyticsRangeDays,
  limits: Pick<ResolvedLimits, "analytics" | "analyticsMaxDays">,
) {
  const range = allowedRange(requested, limits);
  const [row] = await getDatabase()<{ payload: unknown }[]>`
    select public.get_page_analytics_for_owner(
      ${ownerId}::uuid, ${pageId}::uuid, ${range}, ${limits.analytics === "full"}
    ) as payload
  `;
  return parsePageAnalytics(row?.payload, range);
}

export type LinkSummary = {
  pageId: string;
  title: string;
  status: string;
  pageViews: number;
  sessions: number;
  clickSessions: number;
  totalClicks: number;
};

/** All of an owner's links side by side. Callers check for full access first. */
export async function loadLinkComparison(ownerId: string, range: AnalyticsRangeDays): Promise<LinkSummary[]> {
  const rows = await getDatabase()<{
    page_id: string; title: string; status: string; page_views: string; sessions: string; click_sessions: string; total_clicks: string;
  }[]>`select * from public.get_owner_links_summary(${ownerId}::uuid, ${range})`;
  return rows.map((row) => ({
    pageId: row.page_id,
    title: row.title,
    status: row.status,
    pageViews: Number(row.page_views),
    sessions: Number(row.sessions),
    clickSessions: Number(row.click_sessions),
    totalClicks: Number(row.total_clicks),
  }));
}

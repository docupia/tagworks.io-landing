import type { AnalyticsEventPayload } from "@/lib/analytics-events";
import { getAnalyticsDatabase } from "@/lib/database";

export async function recordAnalyticsEvent(
  event: AnalyticsEventPayload,
): Promise<void> {
  const sql = getAnalyticsDatabase();
  await sql`
    select public.record_analytics_event(
      ${event.event_id}::uuid,
      ${event.page_slug},
      ${event.page_version_id}::uuid,
      ${event.event_type},
      ${event.session_id}::uuid,
      ${event.source_type},
      ${event.source_label},
      ${event.utm_source},
      ${event.utm_medium},
      ${event.utm_campaign},
      ${event.link_id}::uuid,
      ${event.excluded_reason}
    )
  `;
}

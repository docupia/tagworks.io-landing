import type { AnalyticsEventPayload, PublishedLink } from "./analytics";
import { getAnalyticsDatabase } from "./database";

export async function syncPublishedLinks(
  pageSlug: string,
  versionId: string,
  links: PublishedLink[],
): Promise<void> {
  const sql = getAnalyticsDatabase();
  await sql`
    select public.sync_published_links(
      ${pageSlug},
      ${versionId}::uuid,
      ${sql.json(links)}
    )
  `;
}

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

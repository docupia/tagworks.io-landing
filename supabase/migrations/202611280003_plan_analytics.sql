-- Plan-gated analytics.
--
-- Data is collected the same way on every plan; plans only change what is
-- returned. Basic (Free, Starter) gets totals, channel totals and the top
-- outbound link for up to 30 days. Full (Pro, Custom) gets the flow, every
-- outbound link, period comparison, CSV export, link comparison and the
-- whole history. Because upgrading only changes what is returned, past data
-- shows up right away.
--
-- The limit is enforced here, not only in the UI: the browser-callable
-- get_page_analytics is revoked and analytics are read by the server through
-- get_page_analytics_for_owner with the tier the server resolved from the
-- plan (apps/web/lib/plans.ts).

create or replace function public.page_analytics_window(
  target_page_id uuid,
  window_start timestamptz,
  window_end timestamptz,
  range_days integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
begin
  with cohort as (
    select session.*
    from public.analytics_sessions as session
    where session.page_id = target_page_id
      and session.started_at >= window_start
      and session.started_at < window_end
      and session.excluded_reason is null
  ), cohort_events as (
    select event.*
    from public.analytics_events as event
    inner join cohort
      on cohort.page_id = event.page_id
     and cohort.page_version_id = event.page_version_id
     and cohort.session_id = event.session_id
    where event.excluded_reason is null
  ), totals as (
    select
      (select count(*) from cohort)::bigint as sessions,
      (select count(*) from cohort where first_link_id is not null)::bigint as click_sessions,
      (select count(*) from cohort_events where event_type = 'page_view')::bigint as page_views,
      (select count(*) from cohort_events where event_type = 'outbound_click')::bigint as total_clicks,
      (select count(*) from cohort where source_type = 'tagworks')::bigint as tagworks_sessions,
      (select max(received_at) from cohort_events) as updated_at
  ), session_clicks as (
    select
      session.id,
      session.source_type,
      session.source_label,
      session.first_link_id,
      count(event.event_id) filter (
        where event.event_type = 'outbound_click'
      )::bigint as total_clicks
    from cohort as session
    left join cohort_events as event
      on event.page_id = session.page_id
     and event.page_version_id = session.page_version_id
     and event.session_id = session.session_id
    group by
      session.id,
      session.source_type,
      session.source_label,
      session.first_link_id
  ), source_rows as (
    select
      session.source_type || ':' || session.source_label as source_key,
      session.source_type,
      session.source_label,
      count(*)::bigint as sessions,
      count(*) filter (where session.first_link_id is not null)::bigint as click_sessions,
      coalesce(sum(session.total_clicks), 0)::bigint as total_clicks
    from session_clicks as session
    group by session.source_type, session.source_label
  ), flow_rows as (
    select
      session.source_type || ':' || session.source_label as source_key,
      session.source_type,
      session.source_label,
      session.first_link_id,
      coalesce(link.label, link.destination_host, '외부 클릭 미관측') as link_label,
      count(*)::bigint as sessions
    from cohort as session
    left join public.page_links as link
      on link.page_id = session.page_id
     and link.page_version_id = session.page_version_id
     and link.id = session.first_link_id
    group by
      session.source_type,
      session.source_label,
      session.first_link_id,
      link.label,
      link.destination_host
  ), link_first_totals as (
    select
      session.first_link_id as link_id,
      count(*)::bigint as first_click_sessions
    from cohort as session
    where session.first_link_id is not null
    group by session.first_link_id
  ), link_click_totals as (
    select
      event.link_id,
      count(distinct event.session_id)::bigint as click_sessions,
      count(*)::bigint as total_clicks
    from cohort_events as event
    where event.event_type = 'outbound_click'
    group by event.link_id
  ), link_rows as (
    select
      link.id,
      link.label,
      link.destination_host,
      link.destination_url,
      coalesce(link_first_totals.first_click_sessions, 0)::bigint as first_click_sessions,
      coalesce(link_click_totals.click_sessions, 0)::bigint as click_sessions,
      coalesce(link_click_totals.total_clicks, 0)::bigint as total_clicks
    from public.page_links as link
    inner join public.pages as page on page.id = link.page_id
    left join link_first_totals on link_first_totals.link_id = link.id
    left join link_click_totals on link_click_totals.link_id = link.id
    where link.page_id = target_page_id
      and (
        link.page_version_id = page.published_version_id
        or link_first_totals.link_id is not null
        or link_click_totals.link_id is not null
      )
  ), calendar as (
    select generate_series(
      timezone('Asia/Seoul', window_start)::date,
      timezone('Asia/Seoul', window_end - interval '1 microsecond')::date,
      interval '1 day'
    )::date as day
  ), daily_rows as (
    select
      calendar.day,
      count(distinct session.id)::bigint as sessions,
      count(distinct session.id) filter (
        where session.first_link_id is not null
      )::bigint as click_sessions
    from calendar
    left join cohort as session
      on timezone('Asia/Seoul', session.started_at)::date = calendar.day
    group by calendar.day
    order by calendar.day
  )
  select jsonb_build_object(
    'updatedAt', coalesce(totals.updated_at, timezone('utc', now())),
    'rangeDays', range_days,
    'summary', jsonb_build_object(
      'pageViews', totals.page_views,
      'sessions', totals.sessions,
      'clickSessions', totals.click_sessions,
      'clickRate', case
        when totals.sessions = 0 then 0
        else round((totals.click_sessions::numeric * 100) / totals.sessions, 1)
      end,
      'totalClicks', totals.total_clicks,
      'tagworksSessions', totals.tagworks_sessions
    ),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', source_rows.source_key,
        'type', source_rows.source_type,
        'label', source_rows.source_label,
        'sessions', source_rows.sessions,
        'clickSessions', source_rows.click_sessions,
        'totalClicks', source_rows.total_clicks
      ) order by source_rows.sessions desc, source_rows.source_label)
      from source_rows
    ), '[]'::jsonb),
    'flows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourceKey', flow_rows.source_key,
        'sourceType', flow_rows.source_type,
        'sourceLabel', flow_rows.source_label,
        'linkId', flow_rows.first_link_id,
        'linkLabel', flow_rows.link_label,
        'sessions', flow_rows.sessions
      ) order by flow_rows.sessions desc, flow_rows.source_label, flow_rows.link_label)
      from flow_rows
    ), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', link_rows.id,
        'label', link_rows.label,
        'domain', link_rows.destination_host,
        'url', link_rows.destination_url,
        'firstClickSessions', link_rows.first_click_sessions,
        'clickSessions', link_rows.click_sessions,
        'totalClicks', link_rows.total_clicks
      ) order by link_rows.total_clicks desc, link_rows.destination_host)
      from link_rows
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', daily_rows.day,
        'sessions', daily_rows.sessions,
        'clickSessions', daily_rows.click_sessions
      ) order by daily_rows.day)
      from daily_rows
    ), '[]'::jsonb)
  )
  into payload
  from totals;

  return payload;
end;
$$;

create or replace function public.get_page_analytics_for_owner(
  target_owner_id uuid,
  target_page_id uuid,
  range_days integer,
  full_access boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  page_created timestamptz;
  window_start timestamptz;
  window_end timestamptz := timezone('utc', now());
  payload jsonb;
  previous jsonb;
  top_link jsonb;
begin
  select page.created_at into page_created
  from public.pages as page
  where page.id = target_page_id
    and page.owner_id = target_owner_id
    and page.deleted_at is null;

  if not found then
    raise exception 'page not found' using errcode = 'P0002';
  end if;

  -- 0 means the whole history and is only available with full access.
  if range_days is null or range_days < 0 or range_days > 3660
    or (range_days = 0 and not full_access)
    or (not full_access and range_days > 30) then
    raise exception 'range not available on this plan' using errcode = '22023';
  end if;

  window_start := case
    when range_days = 0 then date_trunc('day', page_created at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
    else (timezone('Asia/Seoul', now())::date - (range_days - 1))::timestamp at time zone 'Asia/Seoul'
  end;

  payload := public.page_analytics_window(target_page_id, window_start, window_end, range_days);

  if full_access then
    if range_days > 0 then
      previous := public.page_analytics_window(
        target_page_id,
        window_start - (window_end - window_start),
        window_start,
        range_days
      ) -> 'summary';
    end if;
    return payload || jsonb_build_object('tier', 'full', 'previous', previous);
  end if;

  -- Basic: no flow, only the most-clicked outbound link.
  top_link := coalesce(payload -> 'links' -> 0, null);
  return (payload - 'flows' - 'links') || jsonb_build_object(
    'tier', 'basic',
    'flows', '[]'::jsonb,
    'links', case when top_link is null then '[]'::jsonb else jsonb_build_array(top_link) end,
    'linkCount', jsonb_array_length(coalesce(payload -> 'links', '[]'::jsonb)),
    'previous', null
  );
end;
$$;

-- One row per link for side-by-side comparison (full access only; the
-- server checks the plan before calling).
create or replace function public.get_owner_links_summary(
  target_owner_id uuid,
  range_days integer
)
returns table (
  page_id uuid,
  title text,
  status text,
  page_views bigint,
  sessions bigint,
  click_sessions bigint,
  total_clicks bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with bounds as (
    select case
      when range_days = 0 then '-infinity'::timestamptz
      else (timezone('Asia/Seoul', now())::date - (greatest(range_days, 1) - 1))::timestamp at time zone 'Asia/Seoul'
    end as window_start
  ), owner_pages as (
    select page.id, page.title, page.status
    from public.pages as page
    where page.owner_id = target_owner_id and page.deleted_at is null
  ), cohort as (
    select session.*
    from public.analytics_sessions as session
    inner join owner_pages on owner_pages.id = session.page_id
    cross join bounds
    where session.started_at >= bounds.window_start
      and session.excluded_reason is null
  ), event_totals as (
    select
      event.page_id,
      count(*) filter (where event.event_type = 'page_view')::bigint as page_views,
      count(*) filter (where event.event_type = 'outbound_click')::bigint as total_clicks
    from public.analytics_events as event
    inner join cohort
      on cohort.page_id = event.page_id
     and cohort.page_version_id = event.page_version_id
     and cohort.session_id = event.session_id
    where event.excluded_reason is null
    group by event.page_id
  ), session_totals as (
    select
      cohort.page_id,
      count(*)::bigint as sessions,
      count(*) filter (where cohort.first_link_id is not null)::bigint as click_sessions
    from cohort
    group by cohort.page_id
  )
  select
    owner_pages.id,
    owner_pages.title,
    owner_pages.status,
    coalesce(event_totals.page_views, 0),
    coalesce(session_totals.sessions, 0),
    coalesce(session_totals.click_sessions, 0),
    coalesce(event_totals.total_clicks, 0)
  from owner_pages
  left join session_totals on session_totals.page_id = owner_pages.id
  left join event_totals on event_totals.page_id = owner_pages.id
  order by coalesce(session_totals.sessions, 0) desc, owner_pages.title;
$$;

revoke all on function public.page_analytics_window(uuid, timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.get_page_analytics_for_owner(uuid, uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.get_owner_links_summary(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_page_analytics_for_owner(uuid, uuid, integer, boolean) to tagworks_ingest;
grant execute on function public.get_owner_links_summary(uuid, integer) to tagworks_ingest;

-- Close the direct browser path, which returned the full payload.
revoke execute on function public.get_page_analytics(uuid, integer) from authenticated;

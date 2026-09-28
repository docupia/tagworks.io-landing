-- Privacy-preserving page analytics for published TagWorks pages.
--
-- Uploaded documents remain script-free. The isolated publisher adds the only
-- executable code: a nonce-bound platform tracker that sends small events to
-- the publisher API. Raw tables are never exposed through the Data API.

create table public.page_links (
  id uuid primary key,
  page_id uuid not null,
  page_version_id uuid not null,
  ordinal integer not null,
  label text not null,
  destination_url text not null,
  destination_host text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint page_links_page_version_fk
    foreign key (page_id, page_version_id)
    references public.page_versions(page_id, id)
    on delete cascade,
  constraint page_links_page_version_id_unique
    unique (page_id, page_version_id, id),
  constraint page_links_version_ordinal_unique
    unique (page_version_id, ordinal),
  constraint page_links_ordinal_range check (ordinal between 0 and 99),
  constraint page_links_label_length check (
    char_length(btrim(label)) between 1 and 253
  ),
  constraint page_links_url_length check (
    char_length(destination_url) between 9 and 2048
  ),
  constraint page_links_https_only check (
    destination_url ~ '^https://[^[:space:]]+$'
  ),
  constraint page_links_host_length check (
    char_length(destination_host) between 1 and 253
  ),
  constraint page_links_host_shape check (
    destination_host = lower(destination_host)
    and destination_host !~ '[/:@?#[:space:]]'
  )
);

create index page_links_page_version_idx
  on public.page_links (page_id, page_version_id, ordinal);

create trigger page_links_are_immutable
before update on public.page_links
for each row execute function public.prevent_immutable_record_update();

create table public.analytics_sessions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null,
  page_version_id uuid not null,
  session_id uuid not null,
  source_type text not null,
  source_label text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  first_link_id uuid,
  first_outbound_at timestamptz,
  started_at timestamptz not null default timezone('utc', now()),
  last_activity_at timestamptz not null default timezone('utc', now()),
  excluded_reason text,
  constraint analytics_sessions_page_version_fk
    foreign key (page_id, page_version_id)
    references public.page_versions(page_id, id)
    on delete cascade,
  constraint analytics_sessions_page_version_session_unique
    unique (page_id, page_version_id, session_id),
  constraint analytics_sessions_first_link_fk
    foreign key (page_id, page_version_id, first_link_id)
    references public.page_links(page_id, page_version_id, id),
  constraint analytics_sessions_source_type check (
    source_type in ('tagworks', 'utm', 'referrer', 'direct')
  ),
  constraint analytics_sessions_source_label_length check (
    char_length(btrim(source_label)) between 1 and 253
  ),
  constraint analytics_sessions_utm_source_length check (
    utm_source is null or char_length(utm_source) between 1 and 80
  ),
  constraint analytics_sessions_utm_medium_length check (
    utm_medium is null or char_length(utm_medium) between 1 and 80
  ),
  constraint analytics_sessions_utm_campaign_length check (
    utm_campaign is null or char_length(utm_campaign) between 1 and 120
  ),
  constraint analytics_sessions_first_click_pair check (
    (first_link_id is null and first_outbound_at is null)
    or (first_link_id is not null and first_outbound_at is not null)
  ),
  constraint analytics_sessions_activity_order check (
    last_activity_at >= started_at
  ),
  constraint analytics_sessions_excluded_reason check (
    excluded_reason is null or excluded_reason in ('bot', 'prefetch', 'preview')
  )
);

create index analytics_sessions_page_started_idx
  on public.analytics_sessions (page_id, started_at desc);

create index analytics_sessions_page_source_started_idx
  on public.analytics_sessions (page_id, source_type, source_label, started_at desc);

create index analytics_sessions_page_first_link_started_idx
  on public.analytics_sessions (page_id, first_link_id, started_at desc);

create table public.analytics_events (
  event_id uuid primary key,
  page_id uuid not null,
  page_version_id uuid not null,
  session_id uuid,
  event_type text not null,
  link_id uuid,
  source_type text not null,
  source_label text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  received_at timestamptz not null default timezone('utc', now()),
  excluded_reason text,
  constraint analytics_events_page_version_fk
    foreign key (page_id, page_version_id)
    references public.page_versions(page_id, id)
    on delete cascade,
  constraint analytics_events_session_fk
    foreign key (page_id, page_version_id, session_id)
    references public.analytics_sessions(page_id, page_version_id, session_id),
  constraint analytics_events_link_fk
    foreign key (page_id, page_version_id, link_id)
    references public.page_links(page_id, page_version_id, id),
  constraint analytics_events_type check (
    event_type in ('page_view', 'outbound_click')
  ),
  constraint analytics_events_link_shape check (
    (event_type = 'page_view' and link_id is null)
    or (event_type = 'outbound_click' and link_id is not null)
  ),
  constraint analytics_events_source_type check (
    source_type in ('tagworks', 'utm', 'referrer', 'direct')
  ),
  constraint analytics_events_source_label_length check (
    char_length(btrim(source_label)) between 1 and 253
  ),
  constraint analytics_events_utm_source_length check (
    utm_source is null or char_length(utm_source) between 1 and 80
  ),
  constraint analytics_events_utm_medium_length check (
    utm_medium is null or char_length(utm_medium) between 1 and 80
  ),
  constraint analytics_events_utm_campaign_length check (
    utm_campaign is null or char_length(utm_campaign) between 1 and 120
  ),
  constraint analytics_events_excluded_reason check (
    excluded_reason is null or excluded_reason in ('bot', 'prefetch', 'preview')
  )
);

create index analytics_events_page_received_idx
  on public.analytics_events (page_id, received_at desc);

create index analytics_events_session_received_idx
  on public.analytics_events (page_id, page_version_id, session_id, received_at);

create index analytics_events_link_received_idx
  on public.analytics_events (page_id, link_id, received_at desc)
  where event_type = 'outbound_click';

alter table public.page_links enable row level security;
alter table public.analytics_sessions enable row level security;
alter table public.analytics_events enable row level security;

revoke all on table public.page_links from public;
revoke all on table public.analytics_sessions from public;
revoke all on table public.analytics_events from public;
revoke all on table public.page_links from anon, authenticated;
revoke all on table public.analytics_sessions from anon, authenticated;
revoke all on table public.analytics_events from anon, authenticated;

grant insert (
  id,
  page_id,
  page_version_id,
  ordinal,
  label,
  destination_url,
  destination_host
)
on table public.page_links
to tagworks_ingest;

create policy page_links_ingest_create
on public.page_links
for insert
to tagworks_ingest
with check (true);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tagworks_analytics') then
    create role tagworks_analytics;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_roles
    where rolname = 'tagworks_analytics'
      and (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)
  ) then
    raise exception 'existing tagworks_analytics role has unsafe elevated privileges';
  end if;
end;
$$;

alter role tagworks_analytics with
  login
  noinherit
  connection limit 30;

alter role tagworks_analytics set statement_timeout = '10s';
alter role tagworks_analytics set lock_timeout = '3s';
alter role tagworks_analytics set idle_in_transaction_session_timeout = '10s';

grant usage on schema public to tagworks_analytics;
revoke all on table public.pages from tagworks_analytics;
revoke all on table public.page_versions from tagworks_analytics;
revoke all on table public.page_links from tagworks_analytics;
revoke all on table public.analytics_sessions from tagworks_analytics;
revoke all on table public.analytics_events from tagworks_analytics;

-- The publisher needs the immutable version id to associate links and events
-- with the exact artifact that a visitor saw.
drop function public.get_published_page(text);

create function public.get_published_page(page_slug text)
returns table (
  slug text,
  title text,
  description text,
  sanitized_html text,
  version_id uuid,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    page.slug,
    page.title,
    page.description,
    version.sanitized_html,
    version.id as version_id,
    page.updated_at
  from public.pages as page
  inner join public.page_versions as version
    on version.page_id = page.id
   and version.id = page.published_version_id
  where page.slug = page_slug
    and page.status = 'published'
    and page.deleted_at is null
  limit 1;
$$;

revoke all on function public.get_published_page(text) from public;
grant execute on function public.get_published_page(text) to anon, authenticated;

create or replace function public.sync_published_links(
  page_slug text,
  published_version uuid,
  link_rows jsonb
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  target_page_id uuid;
  candidate record;
  inserted_count integer := 0;
  row_count integer;
begin
  if jsonb_typeof(link_rows) <> 'array'
    or jsonb_array_length(link_rows) > 100 then
    raise exception 'link_rows must be an array with at most 100 entries'
      using errcode = '22023';
  end if;

  select page.id
  into target_page_id
  from public.pages as page
  where page.slug = page_slug
    and page.status = 'published'
    and page.deleted_at is null
    and page.published_version_id = published_version;

  if target_page_id is null then
    raise exception 'published page version not found'
      using errcode = 'P0002';
  end if;

  for candidate in
    select parsed.*
    from jsonb_to_recordset(link_rows) as parsed(
      link_id uuid,
      ordinal integer,
      destination_url text,
      destination_host text
    )
    order by parsed.ordinal
  loop
    if candidate.link_id is null
      or candidate.ordinal is null
      or candidate.ordinal not between 0 and 99
      or candidate.destination_url is null
      or char_length(candidate.destination_url) not between 9 and 2048
      or candidate.destination_url !~ '^https://[^[:space:]]+$'
      or candidate.destination_host is null
      or char_length(candidate.destination_host) not between 1 and 253
      or candidate.destination_host <> lower(candidate.destination_host)
      or candidate.destination_host ~ '[/:@?#[:space:]]' then
      raise exception 'invalid published link metadata'
        using errcode = '22023';
    end if;

    insert into public.page_links (
      id,
      page_id,
      page_version_id,
      ordinal,
      label,
      destination_url,
      destination_host
    ) values (
      candidate.link_id,
      target_page_id,
      published_version,
      candidate.ordinal,
      candidate.destination_host,
      candidate.destination_url,
      candidate.destination_host
    )
    on conflict do nothing;

    get diagnostics row_count = row_count;
    inserted_count := inserted_count + row_count;

    if not exists (
      select 1
      from public.page_links as link
      where link.id = candidate.link_id
        and link.page_id = target_page_id
        and link.page_version_id = published_version
        and link.ordinal = candidate.ordinal
        and link.label = candidate.destination_host
        and link.destination_url = candidate.destination_url
        and link.destination_host = candidate.destination_host
    ) then
      raise exception 'published link metadata conflicts with an existing link'
        using errcode = '23505';
    end if;
  end loop;

  return inserted_count;
end;
$$;

create or replace function public.record_analytics_event(
  event_id uuid,
  page_slug text,
  published_version uuid,
  event_kind text,
  anonymous_session_id uuid,
  inbound_source_type text,
  inbound_source_label text,
  inbound_utm_source text,
  inbound_utm_medium text,
  inbound_utm_campaign text,
  outbound_link_id uuid,
  event_excluded_reason text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  target_page_id uuid;
  fixed_source_type text;
  fixed_source_label text;
  fixed_utm_source text;
  fixed_utm_medium text;
  fixed_utm_campaign text;
  was_inserted boolean := false;
begin
  if event_id is null
    or published_version is null
    or event_kind not in ('page_view', 'outbound_click')
    or inbound_source_type not in ('tagworks', 'utm', 'referrer', 'direct')
    or inbound_source_label is null
    or char_length(btrim(inbound_source_label)) not between 1 and 253
    or inbound_source_label ~ '[[:cntrl:]]'
    or (event_kind = 'page_view' and outbound_link_id is not null)
    or (event_kind = 'outbound_click' and outbound_link_id is null)
    or (event_excluded_reason is not null and event_excluded_reason not in ('bot', 'prefetch', 'preview')) then
    raise exception 'invalid analytics event'
      using errcode = '22023';
  end if;

  if (inbound_utm_source is not null and (
        char_length(inbound_utm_source) not between 1 and 80
        or inbound_utm_source ~ '[[:cntrl:]]'
      ))
    or (inbound_utm_medium is not null and (
        char_length(inbound_utm_medium) not between 1 and 80
        or inbound_utm_medium ~ '[[:cntrl:]]'
      ))
    or (inbound_utm_campaign is not null and (
        char_length(inbound_utm_campaign) not between 1 and 120
        or inbound_utm_campaign ~ '[[:cntrl:]]'
      )) then
    raise exception 'invalid analytics campaign values'
      using errcode = '22023';
  end if;

  select page.id
  into target_page_id
  from public.pages as page
  where page.slug = page_slug
    and page.status = 'published'
    and page.deleted_at is null
    and page.published_version_id = published_version;

  if target_page_id is null then
    raise exception 'published page version not found'
      using errcode = 'P0002';
  end if;

  if event_kind = 'outbound_click' and not exists (
    select 1
    from public.page_links as link
    where link.id = outbound_link_id
      and link.page_id = target_page_id
      and link.page_version_id = published_version
  ) then
    raise exception 'outbound link is not registered for this version'
      using errcode = 'P0002';
  end if;

  if (
    select count(*)
    from public.analytics_events as recent
    where recent.page_id = target_page_id
      and recent.received_at >= timezone('utc', now()) - interval '1 minute'
  ) >= 2000 then
    raise exception 'analytics event rate exceeded'
      using errcode = '54000';
  end if;

  fixed_source_type := inbound_source_type;
  fixed_source_label := btrim(inbound_source_label);
  fixed_utm_source := nullif(btrim(inbound_utm_source), '');
  fixed_utm_medium := nullif(btrim(inbound_utm_medium), '');
  fixed_utm_campaign := nullif(btrim(inbound_utm_campaign), '');

  if anonymous_session_id is not null then
    insert into public.analytics_sessions (
      page_id,
      page_version_id,
      session_id,
      source_type,
      source_label,
      utm_source,
      utm_medium,
      utm_campaign,
      excluded_reason
    ) values (
      target_page_id,
      published_version,
      anonymous_session_id,
      fixed_source_type,
      fixed_source_label,
      fixed_utm_source,
      fixed_utm_medium,
      fixed_utm_campaign,
      event_excluded_reason
    )
    on conflict (page_id, page_version_id, session_id) do update
    set last_activity_at = timezone('utc', now());

    select
      session.source_type,
      session.source_label,
      session.utm_source,
      session.utm_medium,
      session.utm_campaign
    into
      fixed_source_type,
      fixed_source_label,
      fixed_utm_source,
      fixed_utm_medium,
      fixed_utm_campaign
    from public.analytics_sessions as session
    where session.page_id = target_page_id
      and session.page_version_id = published_version
      and session.session_id = anonymous_session_id;
  end if;

  insert into public.analytics_events (
    event_id,
    page_id,
    page_version_id,
    session_id,
    event_type,
    link_id,
    source_type,
    source_label,
    utm_source,
    utm_medium,
    utm_campaign,
    excluded_reason
  ) values (
    event_id,
    target_page_id,
    published_version,
    anonymous_session_id,
    event_kind,
    outbound_link_id,
    fixed_source_type,
    fixed_source_label,
    fixed_utm_source,
    fixed_utm_medium,
    fixed_utm_campaign,
    event_excluded_reason
  )
  on conflict on constraint analytics_events_pkey do nothing
  returning true into was_inserted;

  if coalesce(was_inserted, false)
    and anonymous_session_id is not null
    and event_kind = 'outbound_click' then
    update public.analytics_sessions as session
    set
      first_link_id = outbound_link_id,
      first_outbound_at = timezone('utc', now()),
      last_activity_at = timezone('utc', now())
    where session.page_id = target_page_id
      and session.page_version_id = published_version
      and session.session_id = anonymous_session_id
      and session.first_link_id is null;
  end if;

  return coalesce(was_inserted, false);
end;
$$;

create or replace function public.get_owner_page_analytics_summary(
  range_days integer default 7
)
returns table (
  page_id uuid,
  sessions bigint,
  click_sessions bigint,
  total_clicks bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  owner uuid := auth.uid();
  cutoff timestamptz;
begin
  if owner is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  if range_days not in (7, 30, 90) then
    raise exception 'range_days must be 7, 30, or 90'
      using errcode = '22023';
  end if;

  cutoff := (
    (timezone('Asia/Seoul', now())::date - (range_days - 1))::timestamp
    at time zone 'Asia/Seoul'
  );

  return query
  with owner_pages as (
    select page.id
    from public.pages as page
    where page.owner_id = owner
      and page.deleted_at is null
  ), cohort as (
    select session.*
    from public.analytics_sessions as session
    inner join owner_pages on owner_pages.id = session.page_id
    where session.started_at >= cutoff
      and session.excluded_reason is null
  ), click_totals as (
    select event.page_id, count(*)::bigint as total_clicks
    from public.analytics_events as event
    inner join cohort
      on cohort.page_id = event.page_id
     and cohort.page_version_id = event.page_version_id
     and cohort.session_id = event.session_id
    where event.event_type = 'outbound_click'
      and event.excluded_reason is null
    group by event.page_id
  )
  select
    owner_pages.id,
    count(cohort.id)::bigint,
    count(cohort.id) filter (where cohort.first_link_id is not null)::bigint,
    coalesce(max(click_totals.total_clicks), 0)::bigint
  from owner_pages
  left join cohort on cohort.page_id = owner_pages.id
  left join click_totals on click_totals.page_id = owner_pages.id
  group by owner_pages.id;
end;
$$;

create or replace function public.get_page_analytics(
  target_page_id uuid,
  range_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  owner uuid := auth.uid();
  cutoff timestamptz;
  payload jsonb;
begin
  if owner is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  if range_days not in (7, 30, 90) then
    raise exception 'range_days must be 7, 30, or 90'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.pages as page
    where page.id = target_page_id
      and page.owner_id = owner
      and page.deleted_at is null
  ) then
    raise exception 'page not found'
      using errcode = 'P0002';
  end if;

  cutoff := (
    (timezone('Asia/Seoul', now())::date - (range_days - 1))::timestamp
    at time zone 'Asia/Seoul'
  );

  with cohort as (
    select session.*
    from public.analytics_sessions as session
    where session.page_id = target_page_id
      and session.started_at >= cutoff
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
      timezone('Asia/Seoul', cutoff)::date,
      timezone('Asia/Seoul', now())::date,
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

revoke all on function public.sync_published_links(text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.record_analytics_event(
  uuid, text, uuid, text, uuid, text, text, text, text, text, uuid, text
)
  from public, anon, authenticated;
revoke all on function public.get_owner_page_analytics_summary(integer)
  from public, anon;
revoke all on function public.get_page_analytics(uuid, integer)
  from public, anon;

grant execute on function public.sync_published_links(text, uuid, jsonb)
  to tagworks_analytics;
grant execute on function public.record_analytics_event(
  uuid, text, uuid, text, uuid, text, text, text, text, text, uuid, text
)
  to tagworks_analytics;
grant execute on function public.get_owner_page_analytics_summary(integer)
  to authenticated;
grant execute on function public.get_page_analytics(uuid, integer)
  to authenticated;

comment on table public.page_links is
  'Versioned HTTPS destinations discovered in a sanitized published page. Destinations remain direct links.';
comment on table public.analytics_sessions is
  'Anonymous, per-tab publisher sessions. Source is fixed at session creation; no IP or user agent is stored.';
comment on table public.analytics_events is
  'Idempotent page-view and outbound-click observations. Raw rows are never exposed to browser roles.';
comment on function public.sync_published_links(text, uuid, jsonb) is
  'Collector-only, idempotent registration of links parsed from the current sanitized artifact.';
comment on function public.record_analytics_event(
  uuid, text, uuid, text, uuid, text, text, text, text, text, uuid, text
) is
  'Collector-only validated event ingestion with source freezing and first-click assignment.';

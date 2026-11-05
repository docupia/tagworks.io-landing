alter table public.analytics_sessions drop constraint analytics_sessions_source_type;
alter table public.analytics_sessions add constraint analytics_sessions_source_type check (source_type in ('tagworks', 'utm', 'referrer', 'direct', 'parameter'));
alter table public.analytics_events drop constraint analytics_events_source_type;
alter table public.analytics_events add constraint analytics_events_source_type check (source_type in ('tagworks', 'utm', 'referrer', 'direct', 'parameter'));

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
    or inbound_source_type not in ('tagworks', 'utm', 'referrer', 'direct', 'parameter')
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


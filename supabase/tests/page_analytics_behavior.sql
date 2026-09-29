-- Transactional analytics behavior checks. Run after all migrations.

begin;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  'authenticated',
  'authenticated',
  'tagworks-analytics-schema-test@example.invalid',
  extensions.crypt('schema-test-only', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.pages (
  id,
  owner_id,
  slug,
  title,
  status
) values (
  '20000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  'analytics-schema-test',
  'Analytics schema test',
  'draft'
);

insert into public.page_versions (
  id,
  page_id,
  source_object_path,
  source_sha256,
  source_bytes,
  sanitized_html,
  sanitizer_version,
  warnings
) values (
  '30000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/original.html',
  repeat('a', 64),
  100,
  '<a href="https://shop.example/item">Shop</a><a href="https://help.example/contact">Help</a>',
  'analytics-schema-test',
  '[]'::jsonb
);

update public.pages
set
  status = 'published',
  published_version_id = '30000000-0000-4000-8000-000000000001'::uuid,
  published_at = now()
where id = '20000000-0000-4000-8000-000000000001'::uuid;

do $$
declare
  public_sanitizer_version text;
begin
  select published.sanitizer_version
  into public_sanitizer_version
  from public.get_published_page('analytics-schema-test') as published;

  if public_sanitizer_version is distinct from 'analytics-schema-test' then
    raise exception 'public artifact must expose its sanitizer contract';
  end if;
end;
$$;

select public.sync_published_links(
  'analytics-schema-test',
  '30000000-0000-4000-8000-000000000001'::uuid,
  jsonb_build_array(
    jsonb_build_object(
      'link_id', '40000000-0000-8000-8000-000000000001',
      'ordinal', 0,
      'destination_url', 'https://shop.example/item',
      'destination_host', 'shop.example'
    ),
    jsonb_build_object(
      'link_id', '40000000-0000-8000-8000-000000000002',
      'ordinal', 1,
      'destination_url', 'https://help.example/contact',
      'destination_host', 'help.example'
    )
  )
);

do $$
declare
  accepted boolean;
begin
  accepted := public.record_analytics_event(
    '50000000-0000-4000-8000-000000000001'::uuid,
    'analytics-schema-test',
    '30000000-0000-4000-8000-000000000001'::uuid,
    'page_view',
    '60000000-0000-4000-8000-000000000001'::uuid,
    'utm',
    'newsletter',
    'newsletter',
    'email',
    'launch',
    null,
    null
  );
  if not accepted then
    raise exception 'first page view must be accepted';
  end if;

  accepted := public.record_analytics_event(
    '50000000-0000-4000-8000-000000000001'::uuid,
    'analytics-schema-test',
    '30000000-0000-4000-8000-000000000001'::uuid,
    'page_view',
    '60000000-0000-4000-8000-000000000001'::uuid,
    'referrer',
    'should-not-replace.example',
    null,
    null,
    null,
    null,
    null
  );
  if accepted then
    raise exception 'duplicate event id must be ignored';
  end if;

  perform public.record_analytics_event(
    '50000000-0000-4000-8000-000000000002'::uuid,
    'analytics-schema-test',
    '30000000-0000-4000-8000-000000000001'::uuid,
    'page_view',
    '60000000-0000-4000-8000-000000000001'::uuid,
    'referrer',
    'should-not-replace.example',
    null,
    null,
    null,
    null,
    null
  );

  perform public.record_analytics_event(
    '50000000-0000-4000-8000-000000000003'::uuid,
    'analytics-schema-test',
    '30000000-0000-4000-8000-000000000001'::uuid,
    'outbound_click',
    '60000000-0000-4000-8000-000000000001'::uuid,
    'utm',
    'newsletter',
    'newsletter',
    'email',
    'launch',
    '40000000-0000-8000-8000-000000000001'::uuid,
    null
  );

  perform public.record_analytics_event(
    '50000000-0000-4000-8000-000000000004'::uuid,
    'analytics-schema-test',
    '30000000-0000-4000-8000-000000000001'::uuid,
    'outbound_click',
    '60000000-0000-4000-8000-000000000001'::uuid,
    'utm',
    'newsletter',
    'newsletter',
    'email',
    'launch',
    '40000000-0000-8000-8000-000000000001'::uuid,
    null
  );

  perform public.record_analytics_event(
    '50000000-0000-4000-8000-000000000005'::uuid,
    'analytics-schema-test',
    '30000000-0000-4000-8000-000000000001'::uuid,
    'outbound_click',
    '60000000-0000-4000-8000-000000000001'::uuid,
    'utm',
    'newsletter',
    'newsletter',
    'email',
    'launch',
    '40000000-0000-8000-8000-000000000002'::uuid,
    null
  );

  perform public.record_analytics_event(
    '50000000-0000-4000-8000-000000000006'::uuid,
    'analytics-schema-test',
    '30000000-0000-4000-8000-000000000001'::uuid,
    'page_view',
    '60000000-0000-4000-8000-000000000002'::uuid,
    'direct',
    'direct',
    null,
    null,
    null,
    null,
    null
  );
end;
$$;

do $$
declare
  first_link uuid;
  fixed_source text;
  event_count integer;
begin
  select session.first_link_id, session.source_label
  into first_link, fixed_source
  from public.analytics_sessions as session
  where session.page_id = '20000000-0000-4000-8000-000000000001'::uuid
    and session.session_id = '60000000-0000-4000-8000-000000000001'::uuid;

  if first_link is distinct from '40000000-0000-8000-8000-000000000001'::uuid then
    raise exception 'first click changed after later clicks';
  end if;

  if fixed_source is distinct from 'newsletter' then
    raise exception 'session source changed after creation';
  end if;

  select count(*) into event_count
  from public.analytics_events
  where page_id = '20000000-0000-4000-8000-000000000001'::uuid;

  if event_count <> 6 then
    raise exception 'event id dedupe failed: expected 6, got %', event_count;
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

do $$
declare
  analytics jsonb;
  flow_total integer;
begin
  analytics := public.get_page_analytics(
    '20000000-0000-4000-8000-000000000001'::uuid,
    30
  );

  if (analytics #>> '{summary,sessions}')::integer <> 2
    or (analytics #>> '{summary,clickSessions}')::integer <> 1
    or (analytics #>> '{summary,totalClicks}')::integer <> 3
    or (analytics #>> '{summary,pageViews}')::integer <> 3 then
    raise exception 'analytics summary is incorrect: %', analytics -> 'summary';
  end if;

  select coalesce(sum((flow ->> 'sessions')::integer), 0)
  into flow_total
  from jsonb_array_elements(analytics -> 'flows') as flow;

  if flow_total <> 2 then
    raise exception 'flow rows must reconcile to sessions: %', analytics -> 'flows';
  end if;
end;
$$;

rollback;

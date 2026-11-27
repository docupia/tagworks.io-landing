-- Plan-gated analytics checks. Runs in a transaction and rolls back.

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '74000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'tagworks-analytics-plan@example.invalid',
  extensions.crypt('analytics-plan-only', extensions.gen_salt('bf')), now(), '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now());

do $$
declare
  owner uuid := '74000000-0000-4000-8000-000000000001';
  page uuid := '74000000-0000-4000-8000-0000000000a1';
  version uuid := '74000000-0000-4000-8000-0000000000b1';
  link_a uuid := '74000000-0000-4000-8000-0000000000c1';
  link_b uuid := '74000000-0000-4000-8000-0000000000c2';
  basic jsonb;
  full_payload jsonb;
  failed boolean := false;
  i integer;
  session uuid;
begin
  insert into public.pages (id, owner_id, slug, title, status, created_at)
  values (page, owner, 'analytics-plan', 'Analytics plan', 'draft', now() - interval '120 days');
  insert into public.page_versions (id, page_id, source_object_path, source_sha256, source_bytes, sanitized_html, sanitizer_version)
  values (version, page, owner || '/' || page || '/' || version || '/original.html', repeat('b', 64), 10, '<a href="https://a.example">A</a>', 'test');
  update public.pages set status = 'published', published_version_id = version where id = page;
  insert into public.page_links (id, page_id, page_version_id, ordinal, label, destination_url, destination_host)
  values (link_a, page, version, 1, 'A', 'https://a.example/', 'a.example'),
         (link_b, page, version, 2, 'B', 'https://b.example/', 'b.example');

  -- Three sessions this week (two clicks on A, one on B) and one 45 days ago.
  for i in 1..4 loop
    session := gen_random_uuid();
    insert into public.analytics_sessions (page_id, page_version_id, session_id, source_type, source_label, first_link_id, first_outbound_at, started_at)
    values (page, version, session, 'referrer', 'instagram.com',
      case when i <= 2 then link_a when i = 3 then link_b end,
      case when i <= 3 then now() end,
      case when i = 4 then now() - interval '45 days' else now() - interval '1 hour' end);
    insert into public.analytics_events (event_id, page_id, page_version_id, session_id, event_type, link_id, source_type, source_label, received_at)
    values (gen_random_uuid(), page, version, session, 'page_view', null, 'referrer', 'instagram.com', now());
    if i <= 3 then
      insert into public.analytics_events (event_id, page_id, page_version_id, session_id, event_type, link_id, source_type, source_label, received_at)
      values (gen_random_uuid(), page, version, session, 'outbound_click', case when i <= 2 then link_a else link_b end, 'referrer', 'instagram.com', now());
    end if;
  end loop;

  basic := public.get_page_analytics_for_owner(owner, page, 30, false);
  assert basic ->> 'tier' = 'basic';
  assert (basic -> 'summary' ->> 'sessions')::int = 3, 'basic counts sessions';
  assert jsonb_array_length(basic -> 'flows') = 0, 'basic has no flow';
  assert jsonb_array_length(basic -> 'links') = 1, 'basic shows only the top link';
  assert basic -> 'links' -> 0 ->> 'domain' = 'a.example', 'top link is the most clicked';
  assert (basic ->> 'linkCount')::int = 2;
  assert jsonb_array_length(basic -> 'sources') = 1, 'basic keeps channel totals';
  assert basic -> 'previous' = 'null'::jsonb, 'basic has no comparison';

  begin
    perform public.get_page_analytics_for_owner(owner, page, 90, false);
  exception when sqlstate '22023' then failed := true;
  end;
  assert failed, 'basic cannot read 90 days';
  failed := false;
  begin
    perform public.get_page_analytics_for_owner(owner, page, 0, false);
  exception when sqlstate '22023' then failed := true;
  end;
  assert failed, 'basic cannot read the whole history';

  full_payload := public.get_page_analytics_for_owner(owner, page, 30, true);
  assert full_payload ->> 'tier' = 'full';
  assert jsonb_array_length(full_payload -> 'flows') >= 2, 'full has the flow';
  assert jsonb_array_length(full_payload -> 'links') = 2, 'full has every link';
  assert (full_payload -> 'previous' ->> 'sessions')::int = 1, 'previous period is compared';

  full_payload := public.get_page_analytics_for_owner(owner, page, 0, true);
  assert (full_payload -> 'summary' ->> 'sessions')::int = 4, 'whole history includes old data';

  assert (select sessions from public.get_owner_links_summary(owner, 30) where page_id = page) = 3;
  assert (select page_views from public.get_owner_links_summary(owner, 0) where page_id = page) = 4;

  failed := false;
  begin
    perform public.get_page_analytics_for_owner('74000000-0000-4000-8000-000000000999', page, 30, true);
  exception when sqlstate 'P0002' then failed := true;
  end;
  assert failed, 'other owners cannot read the page';
end;
$$;

-- Browsers can no longer call the full analytics function directly.
do $$
begin
  assert not has_function_privilege('authenticated', 'public.get_page_analytics(uuid, integer)', 'execute');
  assert not has_function_privilege('authenticated', 'public.get_page_analytics_for_owner(uuid, uuid, integer, boolean)', 'execute');
end;
$$;

rollback;

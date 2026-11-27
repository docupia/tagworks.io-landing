-- Custom inquiries, admin custom plans and monthly usage notices.
-- Runs in a transaction and rolls back.

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '76000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'tagworks-custom-admin@example.invalid',
  extensions.crypt('custom-admin-only', extensions.gen_salt('bf')), now(), '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '76000000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'tagworks-custom-owner@example.invalid',
  extensions.crypt('custom-owner-only', extensions.gen_salt('bf')), now(), '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.billing_accounts (owner_id, is_super_admin)
values ('76000000-0000-4000-8000-000000000001', true)
on conflict (owner_id) do update set is_super_admin = true;

do $$
declare
  admin uuid := '76000000-0000-4000-8000-000000000001';
  owner uuid := '76000000-0000-4000-8000-000000000002';
  page uuid := '76000000-0000-4000-8000-0000000000a1';
  version uuid := '76000000-0000-4000-8000-0000000000b1';
  failed boolean := false;
  found record;
  account record;
  usage record;
  i integer;
begin
  -- Inquiries: five a day per email.
  for i in 1..5 loop
    perform public.submit_custom_inquiry(null, ' Lead@Example.com ', 50, 100000, 'Event pages', 'ko');
  end loop;
  begin
    perform public.submit_custom_inquiry(null, 'lead@example.com', 50, 100000, 'Event pages', 'ko');
  exception when sqlstate 'P0429' then failed := true;
  end;
  assert failed, 'sixth inquiry in a day is refused';
  assert (select count(*) from public.custom_inquiries where email = 'lead@example.com') = 5;

  -- Only super admins can use admin functions.
  failed := false;
  begin
    perform * from public.admin_list_inquiries(owner, 10);
  exception when sqlstate '42501' then failed := true;
  end;
  assert failed, 'non-admin cannot list inquiries';
  assert (select count(*) from public.admin_list_inquiries(admin, 10)) = 5;
  perform public.admin_update_inquiry(admin,
    (select id from public.custom_inquiries limit 1), 'contacted', 'Called back');
  assert (select count(*) from public.custom_inquiries where status = 'contacted' and admin_note = 'Called back') = 1;

  -- Custom plan set and cleared.
  select * into found from public.admin_find_account(admin, 'TAGWORKS-CUSTOM-OWNER@example.invalid');
  assert found.owner_id = owner and found.plan = 'free', 'account found by email';
  perform public.admin_set_custom_plan(admin, owner, 'custom', 120, 300000, 90, 'Annual contract');
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'custom', 'custom plan applies';
  assert (account.plan_overrides ->> 'maxLinks')::int = 120;
  assert (account.plan_overrides ->> 'monthlyViews')::int = 300000;
  assert account.custom_price_usd = 90;
  assert (select count(*) from public.admin_list_custom_accounts(admin)) = 1;
  failed := false;
  begin
    perform public.admin_set_custom_plan(admin, owner, 'custom', 0, null, null, null);
  exception when sqlstate '22023' then failed := true;
  end;
  assert failed, 'custom plan needs at least one link';
  perform public.admin_set_custom_plan(admin, owner, 'free', null, null, null, null);
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'free' and account.plan_overrides = '{}'::jsonb, 'custom plan cleared';

  -- Monthly usage: each threshold is reported once.
  insert into public.pages (id, owner_id, slug, title, status, created_at)
  values (page, owner, 'usage-plan', 'Usage plan', 'draft', now());
  insert into public.page_versions (id, page_id, source_object_path, source_sha256, source_bytes, sanitized_html, sanitizer_version)
  values (version, page, owner || '/' || page || '/' || version || '/original.html', repeat('c', 64), 10, '<p>x</p>', 'test');
  update public.pages set status = 'published', published_version_id = version where id = page;

  for i in 1..8 loop
    insert into public.analytics_events (event_id, page_id, page_version_id, event_type, source_type, source_label, received_at)
    values (gen_random_uuid(), page, version, 'page_view', 'direct', 'direct', now());
  end loop;
  -- Bots and last month's views are not counted.
  insert into public.analytics_events (event_id, page_id, page_version_id, event_type, source_type, source_label, received_at, excluded_reason)
  values (gen_random_uuid(), page, version, 'page_view', 'direct', 'direct', now(), 'bot');
  insert into public.analytics_events (event_id, page_id, page_version_id, event_type, source_type, source_label, received_at)
  values (gen_random_uuid(), page, version, 'page_view', 'direct', 'direct', date_trunc('month', now()) - interval '1 day');

  select * into usage from public.refresh_monthly_usage(owner, 10);
  assert usage.page_views = 8 and usage.percent = 80, 'counts this month only';
  assert usage.newly_crossed = array[80], '80% crossed';
  select * into usage from public.refresh_monthly_usage(owner, 10);
  assert usage.newly_crossed = '{}'::int[] and usage.notified = array[80], '80% reported once';

  for i in 1..25 loop
    insert into public.analytics_events (event_id, page_id, page_version_id, event_type, source_type, source_label, received_at)
    values (gen_random_uuid(), page, version, 'page_view', 'direct', 'direct', now());
  end loop;
  select * into usage from public.refresh_monthly_usage(owner, 10);
  assert usage.percent = 330 and usage.newly_crossed = array[100, 300], '100% and 300% crossed together';
  assert (select count(*) from public.owners_with_views_this_month(100) where owner_id = owner) = 1;

  -- Scheduled reminders and reconcile.
  update public.billing_accounts
  set plan = 'pro', subscription_status = 'ACTIVE', pending_plan = 'starter',
      subscription_period_start = now() - interval '25 days', subscription_period_end = now() + interval '5 days'
  where owner_id = owner;
  assert (select count(*) from public.upcoming_plan_changes(7) where owner_id = owner and next_plan = 'starter') = 1;
  assert (select count(*) from public.upcoming_plan_changes(1) where owner_id = owner) = 0;
  update public.billing_accounts
  set subscription_period_start = now() - interval '32 days', subscription_period_end = now() - interval '1 day'
  where owner_id = owner;
  assert (select count(*) from public.owners_needing_reconcile(100) where owner_id = owner) = 1;
end;
$$;

-- Browser roles cannot reach any of it.
set local role authenticated;
do $$
declare failed boolean := false;
begin
  begin
    perform public.submit_custom_inquiry(null, 'x@example.com', 1, 1, 'x', 'en');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'authenticated cannot call inquiry function directly';
end;
$$;
reset role;

rollback;

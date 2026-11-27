-- Link-based plan behavior checks. Runs in a transaction and rolls back.

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '72000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'tagworks-plan-test@example.invalid',
  extensions.crypt('plan-test-only', extensions.gen_salt('bf')), now(), '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now());

-- Three published pages, edited at different times.
do $$
declare
  owner uuid := '72000000-0000-4000-8000-000000000001';
  i integer;
  page_id uuid;
  version_id uuid;
begin
  for i in 1..3 loop
    page_id := gen_random_uuid();
    version_id := gen_random_uuid();
    insert into public.pages (id, owner_id, slug, title, status)
    values (page_id, owner, 'plan-test-' || i, 'Plan test ' || i, 'draft');
    insert into public.page_versions (id, page_id, source_object_path, source_sha256, source_bytes,
      sanitized_html, sanitizer_version)
    values (version_id, page_id, owner || '/' || page_id || '/' || version_id || '/original.html',
      repeat('a', 64), 10, '<p>test</p>', 'test');
    update public.pages
    set status = 'published', published_version_id = version_id,
        last_edited_at = now() - make_interval(days => i)
    where id = page_id;
  end loop;
end;
$$;

do $$
declare
  owner uuid := '72000000-0000-4000-8000-000000000001';
  account record;
  result record;
  page_status text;
  kept uuid;
  first_page uuid;
  wait integer;
begin
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'free', 'a new account is on Free';
  assert account.live_links = 3, 'three links are live';

  -- An active Pro subscription applies Pro.
  update public.billing_accounts
  set plan = 'pro', subscription_status = 'ACTIVE',
      subscription_period_start = now() - interval '1 day',
      subscription_period_end = now() + interval '29 days'
  where owner_id = owner;
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'pro', 'active subscription applies Pro';

  -- Cancelled keeps the plan until the end of the paid period.
  update public.billing_accounts set subscription_status = 'CANCELLED' where owner_id = owner;
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'pro', 'cancelled keeps Pro until period end';

  update public.billing_accounts set subscription_period_end = now() - interval '1 minute',
    subscription_period_start = now() - interval '31 days' where owner_id = owner;
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'free', 'cancelled falls back to Free after period end';

  -- Payment failure grace.
  update public.billing_accounts set subscription_status = 'SUSPENDED', grace_until = now() + interval '7 days'
  where owner_id = owner;
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'pro', 'grace period keeps Pro';
  update public.billing_accounts set grace_until = null, subscription_status = 'ACTIVE',
    subscription_period_end = now() + interval '10 days', pending_plan = 'starter' where owner_id = owner;
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'pro', 'scheduled downgrade waits for period end';
  update public.billing_accounts set subscription_period_end = now() - interval '1 day' where owner_id = owner;
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'starter', 'scheduled downgrade applies after period end';

  -- Custom is set by an admin and ignores PayPal state.
  update public.billing_accounts set plan = 'custom', plan_overrides = '{"maxLinks": 100}', subscription_status = null
  where owner_id = owner;
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'custom', 'custom plan applies';
  assert (account.plan_overrides ->> 'maxLinks')::int = 100, 'overrides are returned';

  -- Downgrade to one link keeps the chosen link, closes the rest.
  select id into kept from public.pages where owner_id = owner and slug = 'plan-test-3';
  perform public.set_links_kept_on_downgrade(owner, array[kept]);
  select * into result from public.reconcile_live_links(owner, 1);
  assert result.closed = 2, 'two links closed';
  select pages.status into page_status from public.pages where id = kept;
  assert page_status = 'published', 'the chosen link stays live';
  assert (select count(*) from public.pages where owner_id = owner and unpublished_reason = 'downgrade') = 2,
    'closed links are marked as downgrade, not deleted';

  -- Resubscribing reopens them, most recently edited first.
  select * into result from public.reconcile_live_links(owner, 2);
  assert result.restored = 1, 'one link restored when one slot opens';
  select id into first_page from public.pages where owner_id = owner and slug = 'plan-test-1';
  assert (select pages.status from public.pages where id = first_page) = 'published',
    'the most recently edited closed link comes back first';
  select * into result from public.reconcile_live_links(owner, 30);
  assert result.restored = 1, 'remaining link restored';
  select * into result from public.reconcile_live_links(owner, 30);
  assert result.closed = 0 and result.restored = 0, 'reconcile is idempotent';

  -- Owner unpublish frees a slot; publishing again respects the limit.
  assert public.set_page_live(owner, first_page, false, 3) = 'ok';
  assert (select unpublished_reason from public.pages where id = first_page) = 'user';
  select * into result from public.reconcile_live_links(owner, 30);
  assert result.restored = 0, 'user-closed links are not reopened automatically';
  assert public.set_page_live(owner, first_page, true, 2) = 'limit', 'cannot exceed the limit';
  assert public.set_page_live(owner, first_page, true, 3) = 'ok', 'publishes when a slot is free';
  assert public.get_page_availability('plan-test-1') = 'published';
  perform public.set_page_live(owner, first_page, false, 3);
  assert public.get_page_availability('plan-test-1') = 'closed', 'closed links report closed';
  assert public.get_page_availability('missing-slug') is null;

  -- Hourly edit limit.
  for i in 1..20 loop
    assert public.page_edit_retry_after(first_page, 20) = 0, 'edits under the limit are allowed';
    perform public.record_page_edit(owner, first_page);
  end loop;
  wait := public.page_edit_retry_after(first_page, 20);
  assert wait between 3500 and 3600, 'the 21st edit waits about an hour';
end;
$$;

rollback;

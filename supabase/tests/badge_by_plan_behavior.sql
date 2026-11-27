-- The corner badge shows only on Free accounts. Runs in a transaction and rolls back.

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '77000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'tagworks-badge@example.invalid',
  extensions.crypt('badge-only', extensions.gen_salt('bf')), now(), '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now());

do $$
declare
  owner uuid := '77000000-0000-4000-8000-000000000001';
  page uuid := '77000000-0000-4000-8000-0000000000a1';
  version uuid := '77000000-0000-4000-8000-0000000000b1';
begin
  insert into public.pages (id, owner_id, slug, title, status)
  values (page, owner, 'badge-plan', 'Badge plan', 'draft');
  insert into public.page_versions (id, page_id, source_object_path, source_sha256, source_bytes, sanitized_html, sanitizer_version)
  values (version, page, owner || '/' || page || '/' || version || '/original.html', repeat('d', 64), 10, '<p>x</p>', 'test');
  update public.pages set status = 'published', published_version_id = version where id = page;

  -- No billing row yet: Free.
  assert (select show_badge from public.get_published_page('badge-plan')), 'free shows the badge';

  perform public.sync_paypal_plan(owner, 'I-BADGE', 'P-STARTER-M', 'starter', 'month', 'PAYER', 'ACTIVE',
    now() - interval '1 day', now() + interval '29 days', now());
  assert not (select show_badge from public.get_published_page('badge-plan')), 'starter hides the badge';
  assert (select effective_plan from public.get_account_plan(owner)) = 'starter';

  -- Cancelled and past the paid period: back to Free.
  update public.billing_accounts
  set subscription_status = 'CANCELLED', subscription_period_start = now() - interval '31 days',
      subscription_period_end = now() - interval '1 hour'
  where owner_id = owner;
  assert (select show_badge from public.get_published_page('badge-plan')), 'expired plan shows the badge again';
  assert (select effective_plan from public.get_account_plan(owner)) = 'free';

  update public.billing_accounts set plan = 'custom' where owner_id = owner;
  assert not (select show_badge from public.get_published_page('badge-plan')), 'custom hides the badge';
end;
$$;

set local role anon;
do $$
begin
  assert (select count(*) from public.get_published_page('badge-plan')) = 1, 'anon can read the page';
end;
$$;
reset role;

rollback;

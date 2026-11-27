-- Custom plan inquiries, admin tools for custom accounts, and monthly
-- page-view usage with fair-use notices.
--
-- Page views never block a public page. Usage is only counted so the owner
-- sees a notice at 80% and 100% of the plan's monthly views, and an
-- administrator is told at 300%.

-- Custom inquiries -------------------------------------------------------

create table public.custom_inquiries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  email text not null,
  links_needed integer not null,
  monthly_views integer,
  use_case text not null,
  locale text not null default 'en',
  status text not null default 'new',
  admin_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint custom_inquiries_email check (
    char_length(email) between 3 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  constraint custom_inquiries_links check (links_needed between 1 and 100000),
  constraint custom_inquiries_views check (monthly_views is null or monthly_views between 0 and 2000000000),
  constraint custom_inquiries_use_case check (char_length(btrim(use_case)) between 1 and 2000),
  constraint custom_inquiries_locale check (locale in ('en', 'ko', 'ja', 'es', 'de', 'zh')),
  constraint custom_inquiries_status check (status in ('new', 'contacted', 'won', 'closed')),
  constraint custom_inquiries_note check (admin_note is null or char_length(admin_note) <= 2000)
);

create index custom_inquiries_created_idx on public.custom_inquiries (created_at desc);
create index custom_inquiries_email_created_idx on public.custom_inquiries (lower(email), created_at desc);

alter table public.custom_inquiries enable row level security;
revoke all on table public.custom_inquiries from public, anon, authenticated, tagworks_ingest;

-- Saves an inquiry. At most five per email address (or signed-in account)
-- per day, so the form can't be used to flood the inbox.
create or replace function public.submit_custom_inquiry(
  target_owner_id uuid,
  contact_email text,
  links integer,
  views integer,
  description text,
  inquiry_locale text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  recent integer;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(lower(btrim(contact_email)), 82));
  select count(*)::integer into recent
  from public.custom_inquiries
  where created_at > timezone('utc', now()) - interval '1 day'
    and (lower(email) = lower(btrim(contact_email))
      or (target_owner_id is not null and owner_id = target_owner_id));
  if recent >= 5 then
    raise exception 'too many inquiries' using errcode = 'P0429';
  end if;

  insert into public.custom_inquiries (owner_id, email, links_needed, monthly_views, use_case, locale)
  values (target_owner_id, lower(btrim(contact_email)), links, views, btrim(description), inquiry_locale)
  returning id into new_id;
  return new_id;
end;
$$;

-- Admin tools --------------------------------------------------------------

create or replace function public.require_super_admin(admin_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.billing_accounts
    where owner_id = admin_owner_id and is_super_admin
  ) then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_list_inquiries(admin_owner_id uuid, max_rows integer default 100)
returns table (
  id uuid,
  owner_id uuid,
  email text,
  links_needed integer,
  monthly_views integer,
  use_case text,
  locale text,
  status text,
  admin_note text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.require_super_admin(admin_owner_id);
  return query
  select inquiry.id, inquiry.owner_id, inquiry.email, inquiry.links_needed,
    inquiry.monthly_views, inquiry.use_case, inquiry.locale, inquiry.status,
    inquiry.admin_note, inquiry.created_at
  from public.custom_inquiries as inquiry
  order by (inquiry.status = 'new') desc, inquiry.created_at desc
  limit least(greatest(coalesce(max_rows, 100), 1), 500);
end;
$$;

create or replace function public.admin_update_inquiry(
  admin_owner_id uuid,
  inquiry_id uuid,
  new_status text,
  note text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.require_super_admin(admin_owner_id);
  update public.custom_inquiries
  set status = new_status,
      admin_note = nullif(btrim(note), ''),
      updated_at = timezone('utc', now())
  where id = inquiry_id;
end;
$$;

-- Finds an account by sign-in email, with its plan and live links.
create or replace function public.admin_find_account(admin_owner_id uuid, account_email text)
returns table (
  owner_id uuid,
  email text,
  plan text,
  plan_overrides jsonb,
  custom_price_usd numeric,
  contract_note text,
  is_super_admin boolean,
  subscription_status text,
  live_links integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public.require_super_admin(admin_owner_id);
  return query
  select usr.id, usr.email::text, coalesce(account.plan, 'free'), coalesce(account.plan_overrides, '{}'::jsonb),
    account.custom_price_usd, account.contract_note, coalesce(account.is_super_admin, false),
    account.subscription_status,
    (select count(*)::integer from public.pages as page
      where page.owner_id = usr.id and page.status = 'published' and page.deleted_at is null)
  from auth.users as usr
  left join public.billing_accounts as account on account.owner_id = usr.id
  where lower(usr.email) = lower(btrim(account_email))
  limit 1;
end;
$$;

-- Lists every account on a custom plan.
create or replace function public.admin_list_custom_accounts(admin_owner_id uuid)
returns table (
  owner_id uuid,
  email text,
  plan_overrides jsonb,
  custom_price_usd numeric,
  contract_note text,
  live_links integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public.require_super_admin(admin_owner_id);
  return query
  select account.owner_id, usr.email::text, account.plan_overrides, account.custom_price_usd,
    account.contract_note,
    (select count(*)::integer from public.pages as page
      where page.owner_id = account.owner_id and page.status = 'published' and page.deleted_at is null)
  from public.billing_accounts as account
  join auth.users as usr on usr.id = account.owner_id
  where account.plan = 'custom'
  order by usr.email;
end;
$$;

-- Puts an account on a custom plan, or takes it off (target_plan 'free').
-- Live links are reconciled by the app with the new limit afterwards.
create or replace function public.admin_set_custom_plan(
  admin_owner_id uuid,
  target_owner_id uuid,
  target_plan text,
  max_links integer,
  monthly_views integer,
  price_usd numeric,
  note text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.require_super_admin(admin_owner_id);
  if target_plan not in ('custom', 'free') then
    raise exception 'target_plan must be custom or free' using errcode = '22023';
  end if;
  if target_plan = 'custom' and (max_links is null or max_links < 1 or max_links > 100000) then
    raise exception 'max_links must be between 1 and 100000' using errcode = '22023';
  end if;

  insert into public.billing_accounts (owner_id)
  values (target_owner_id)
  on conflict (owner_id) do nothing;

  if target_plan = 'custom' then
    update public.billing_accounts
    set plan = 'custom',
        plan_overrides = jsonb_strip_nulls(jsonb_build_object(
          'maxLinks', max_links,
          'monthlyViews', case when monthly_views > 0 then monthly_views end
        )),
        custom_price_usd = price_usd,
        contract_note = nullif(btrim(note), ''),
        pending_plan = null,
        updated_at = timezone('utc', now())
    where owner_id = target_owner_id;
  else
    -- Back to self-serve. An active PayPal subscription is re-applied by the
    -- app from PayPal right after this call.
    update public.billing_accounts
    set plan = 'free',
        plan_overrides = '{}'::jsonb,
        custom_price_usd = null,
        contract_note = nullif(btrim(note), ''),
        updated_at = timezone('utc', now())
    where owner_id = target_owner_id;
  end if;
end;
$$;

-- Monthly page-view usage --------------------------------------------------

create table public.monthly_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  page_views bigint not null default 0,
  view_limit integer not null default 0,
  notified_80_at timestamptz,
  notified_100_at timestamptz,
  notified_300_at timestamptz,
  counted_at timestamptz not null default timezone('utc', now()),
  primary key (owner_id, month),
  constraint monthly_usage_month_start check (month = date_trunc('month', month)::date)
);

alter table public.monthly_usage enable row level security;
revoke all on table public.monthly_usage from public, anon, authenticated, tagworks_ingest;

-- Counts this month's page views (UTC calendar month, bots and previews
-- excluded) across the owner's pages, stores them, and returns which notice
-- thresholds were crossed for the first time this month. Each threshold is
-- reported once per month, even with concurrent callers.
create or replace function public.refresh_monthly_usage(target_owner_id uuid, view_limit integer)
returns table (
  page_views bigint,
  percent integer,
  newly_crossed integer[],
  notified integer[]
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  month_start date := date_trunc('month', timezone('utc', now()))::date;
  views bigint;
  pct integer;
  usage public.monthly_usage%rowtype;
  crossed integer[] := '{}';
begin
  select count(*) into views
  from public.analytics_events as event
  join public.pages as page on page.id = event.page_id
  where page.owner_id = target_owner_id
    and event.event_type = 'page_view'
    and event.excluded_reason is null
    and event.received_at >= month_start::timestamp
    and event.received_at < (month_start + interval '1 month')::timestamp;

  pct := case when coalesce(view_limit, 0) > 0
    then least(floor(views * 100.0 / view_limit), 100000)::integer else 0 end;

  insert into public.monthly_usage as current (owner_id, month, page_views, view_limit)
  values (target_owner_id, month_start, views, coalesce(view_limit, 0))
  on conflict (owner_id, month) do update
    set page_views = excluded.page_views,
        view_limit = excluded.view_limit,
        counted_at = timezone('utc', now());

  select * into usage from public.monthly_usage
  where owner_id = target_owner_id and month = month_start
  for update;

  if pct >= 80 and usage.notified_80_at is null then crossed := crossed || 80; end if;
  if pct >= 100 and usage.notified_100_at is null then crossed := crossed || 100; end if;
  if pct >= 300 and usage.notified_300_at is null then crossed := crossed || 300; end if;

  update public.monthly_usage
  set notified_80_at = case when 80 = any(crossed) then timezone('utc', now()) else notified_80_at end,
      notified_100_at = case when 100 = any(crossed) then timezone('utc', now()) else notified_100_at end,
      notified_300_at = case when 300 = any(crossed) then timezone('utc', now()) else notified_300_at end
  where owner_id = target_owner_id and month = month_start
  returning * into usage;

  return query select views, pct, crossed,
    array_remove(array[
      case when usage.notified_80_at is not null then 80 end,
      case when usage.notified_100_at is not null then 100 end,
      case when usage.notified_300_at is not null then 300 end
    ], null);
end;
$$;

-- Owners with any page views this month, for the scheduled usage check.
create or replace function public.owners_with_views_this_month(max_rows integer default 1000)
returns table (owner_id uuid, email text)
language sql
security definer
set search_path = pg_catalog, public, auth
as $$
  select owners.owner_id, usr.email::text
  from (
    select distinct page.owner_id
    from public.analytics_events as event
    join public.pages as page on page.id = event.page_id
    where event.event_type = 'page_view'
      and event.excluded_reason is null
      and event.received_at >= date_trunc('month', timezone('utc', now()))
  ) as owners
  join auth.users as usr on usr.id = owners.owner_id
  limit least(greatest(coalesce(max_rows, 1000), 1), 10000);
$$;

-- Accounts with a downgrade or a cancellation taking effect within the next
-- `within_days` days, for reminder emails. Each account is returned with the
-- number of links that will be made private.
create or replace function public.upcoming_plan_changes(within_days integer)
returns table (
  owner_id uuid,
  email text,
  current_plan text,
  next_plan text,
  change_at timestamptz,
  live_links integer
)
language sql
security definer
set search_path = pg_catalog, public, auth
as $$
  select account.owner_id, usr.email::text, account.plan,
    coalesce(account.pending_plan, 'free'),
    account.subscription_period_end,
    (select count(*)::integer from public.pages as page
      where page.owner_id = account.owner_id and page.status = 'published' and page.deleted_at is null)
  from public.billing_accounts as account
  join auth.users as usr on usr.id = account.owner_id
  where account.plan in ('starter', 'pro')
    and (account.pending_plan is not null
      or account.subscription_status in ('CANCELLED', 'SUSPENDED', 'EXPIRED'))
    and account.subscription_period_end > timezone('utc', now())
    and account.subscription_period_end <= timezone('utc', now()) + make_interval(days => within_days);
$$;

-- Owners whose paid period has ended, so their extra links can be made
-- private by the scheduled job even if they never sign in.
create or replace function public.owners_needing_reconcile(max_rows integer default 1000)
returns table (owner_id uuid)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select account.owner_id
  from public.billing_accounts as account
  where account.plan in ('starter', 'pro')
    and account.subscription_period_end < timezone('utc', now())
    and (account.pending_plan is not null
      or account.subscription_status in ('CANCELLED', 'SUSPENDED', 'EXPIRED'))
    and coalesce(account.grace_until, '-infinity') < timezone('utc', now())
  limit least(greatest(coalesce(max_rows, 1000), 1), 10000);
$$;

-- Grants -----------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.submit_custom_inquiry(uuid, text, integer, integer, text, text)',
    'public.require_super_admin(uuid)',
    'public.admin_list_inquiries(uuid, integer)',
    'public.admin_update_inquiry(uuid, uuid, text, text)',
    'public.admin_find_account(uuid, text)',
    'public.admin_list_custom_accounts(uuid)',
    'public.admin_set_custom_plan(uuid, uuid, text, integer, integer, numeric, text)',
    'public.refresh_monthly_usage(uuid, integer)',
    'public.owners_with_views_this_month(integer)',
    'public.upcoming_plan_changes(integer)',
    'public.owners_needing_reconcile(integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to tagworks_ingest', fn);
  end loop;
end;
$$;

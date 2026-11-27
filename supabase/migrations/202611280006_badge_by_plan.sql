-- Hide the TagWorks corner badge on pages of paid accounts.
--
-- The effective-plan rule moves into one stable function so the account
-- screens and the public page lookup always agree.

create or replace function public.effective_plan(account public.billing_accounts)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  -- A paid plan stays in force while PayPal reports the subscription active
  -- (with seven days of grace after a missed renewal), until the end of an
  -- already-paid period after cancellation, or during an explicit payment
  -- failure grace period. A scheduled downgrade applies once the paid
  -- period has ended.
  select case
    when account.owner_id is null then 'free'
    when account.is_super_admin or account.plan = 'custom' then 'custom'
    when not (account.plan in ('starter', 'pro') and (
      (account.subscription_status = 'ACTIVE'
        and coalesce(account.subscription_period_end, timezone('utc', now()))
          > timezone('utc', now()) - interval '7 days')
      or (account.subscription_status in ('CANCELLED', 'SUSPENDED', 'EXPIRED')
        and account.subscription_period_end > timezone('utc', now()))
      or coalesce(account.grace_until > timezone('utc', now()), false)
    )) then 'free'
    when account.pending_plan is not null
      and account.subscription_period_end <= timezone('utc', now()) then account.pending_plan
    else account.plan
  end;
$$;

revoke all on function public.effective_plan(public.billing_accounts) from public, anon, authenticated;

create or replace function public.get_account_plan(target_owner_id uuid)
returns table (
  plan text,
  effective_plan text,
  plan_overrides jsonb,
  is_super_admin boolean,
  subscription_status text,
  subscription_period_end timestamptz,
  paypal_subscription_id text,
  paypal_subscription_plan_id text,
  pending_plan text,
  grace_until timestamptz,
  custom_price_usd numeric,
  live_links integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  account public.billing_accounts%rowtype;
  current_plan text;
begin
  insert into public.billing_accounts (owner_id)
  values (target_owner_id)
  on conflict (owner_id) do nothing;

  select * into account
  from public.billing_accounts
  where owner_id = target_owner_id;

  current_plan := public.effective_plan(account);

  return query select
    account.plan,
    current_plan,
    account.plan_overrides,
    account.is_super_admin,
    account.subscription_status,
    account.subscription_period_end,
    account.paypal_subscription_id,
    account.paypal_subscription_plan_id,
    account.pending_plan,
    account.grace_until,
    account.custom_price_usd,
    (
      select count(*)::integer
      from public.pages as page
      where page.owner_id = target_owner_id
        and page.status = 'published'
        and page.deleted_at is null
    );
end;
$$;

drop function public.get_published_page(text);

create function public.get_published_page(page_slug text)
returns table (
  slug text,
  title text,
  description text,
  sanitized_html text,
  sanitizer_version text,
  version_id uuid,
  updated_at timestamptz,
  show_badge boolean
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
    version.sanitizer_version,
    version.id as version_id,
    page.updated_at,
    coalesce(public.effective_plan(account), 'free') = 'free' as show_badge
  from public.pages as page
  inner join public.page_versions as version
    on version.page_id = page.id
   and version.id = page.published_version_id
  left join public.billing_accounts as account
    on account.owner_id = page.owner_id
  where page.slug = page_slug
    and page.status = 'published'
    and page.deleted_at is null
  limit 1;
$$;

revoke all on function public.get_published_page(text) from public;
grant execute on function public.get_published_page(text) to anon, authenticated;

comment on function public.get_published_page(text) is
  'Public lookup for one published page. show_badge is false for paid, custom and admin accounts.';

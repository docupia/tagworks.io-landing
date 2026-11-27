-- PayPal subscriptions for Starter and Pro, monthly or yearly.
--
-- The old upload-count products ($20 Pro monthly with 50 uploads and the $100
-- prepaid pack of 300 uploads) are retired. There are no paying customers, so
-- they are replaced without a data migration. paypal_payments is kept as a
-- historical ledger.

alter table public.billing_accounts
  add column billing_interval text,
  add constraint billing_accounts_billing_interval check (
    billing_interval is null or billing_interval in ('month', 'year')
  );

-- Upload counters are gone from code and screens.
drop function if exists public.get_upload_entitlement(uuid);
drop function if exists public.reserve_upload_quota(uuid, uuid, text);
drop function if exists public.release_upload_quota(uuid, uuid);
drop function if exists public.consume_upload_quota(uuid, uuid);
drop function if exists public.grant_paypal_prepaid_pack(uuid, text, text, text, numeric, text, timestamptz);
drop function if exists public.sync_paypal_subscription(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz);

alter table public.billing_accounts drop constraint if exists billing_accounts_usage_nonnegative;
alter table public.billing_accounts
  drop column monthly_uploads_used,
  drop column prepaid_uploads_granted,
  drop column prepaid_uploads_remaining,
  drop column free_uploads_used;

alter table public.upload_reservations drop constraint if exists upload_reservations_quota_source;
alter table public.upload_reservations
  drop column if exists quota_source,
  drop column if exists quota_period_start;

comment on table public.billing_accounts is
  'Server-only plan and PayPal subscription state. Limits live in apps/web/lib/plans.ts.';

-- Applies the state of a PayPal subscription to the account.
--   * Upgrades apply at once.
--   * A downgrade on the same subscription waits for the end of the paid
--     period (pending_plan) and is applied when the next period starts.
--   * Cancelled, suspended or expired subscriptions keep the plan until the
--     paid period ends; get_account_plan falls back to Free afterwards.
--   * Custom accounts are managed by an administrator and are not changed.
create or replace function public.sync_paypal_plan(
  target_owner_id uuid,
  subscription_id text,
  paypal_plan_id text,
  new_plan text,
  new_interval text,
  payer_id text,
  new_status text,
  period_start timestamptz,
  period_end timestamptz,
  status_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  account public.billing_accounts%rowtype;
  same_subscription boolean;
  rank_old integer;
  rank_new integer;
  next_plan text;
  next_pending text;
begin
  if new_plan not in ('starter', 'pro') then
    raise exception 'unsupported plan' using errcode = '22023';
  end if;
  if new_interval not in ('month', 'year') then
    raise exception 'unsupported billing interval' using errcode = '22023';
  end if;
  if new_status not in ('APPROVAL_PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED') then
    raise exception 'unsupported PayPal subscription status' using errcode = '22023';
  end if;
  if new_status = 'ACTIVE' and (period_start is null or period_end is null or period_end <= period_start) then
    raise exception 'active PayPal subscription requires a valid billing period' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_owner_id::text, 73));

  insert into public.billing_accounts (owner_id)
  values (target_owner_id)
  on conflict (owner_id) do nothing;

  select * into account
  from public.billing_accounts
  where owner_id = target_owner_id
  for update;

  -- Never let a different, older subscription overwrite an active one.
  if account.paypal_subscription_id is not null
    and account.paypal_subscription_id is distinct from subscription_id
    and account.subscription_status = 'ACTIVE'
    and account.subscription_period_end > timezone('utc', now()) then
    return false;
  end if;

  same_subscription := account.paypal_subscription_id is not distinct from subscription_id;

  if same_subscription
    and account.subscription_status_updated_at is not null
    and status_updated_at < account.subscription_status_updated_at then
    return false;
  end if;

  rank_old := case account.plan when 'pro' then 2 when 'starter' then 1 else 0 end;
  rank_new := case new_plan when 'pro' then 2 else 1 end;
  next_plan := account.plan;
  next_pending := account.pending_plan;

  if account.plan <> 'custom' and new_status = 'ACTIVE' then
    if same_subscription and rank_new < rank_old
      and account.subscription_period_end > timezone('utc', now())
      and period_start <= coalesce(account.subscription_period_start, period_start) then
      -- Downgrade inside the paid period: keep the current plan for now.
      next_pending := new_plan;
    else
      next_plan := new_plan;
      next_pending := null;
    end if;
  elsif account.plan <> 'custom' and account.plan = 'free' then
    -- First sync of a subscription that is not active yet.
    next_plan := new_plan;
  end if;

  update public.billing_accounts
  set paid_customer = paid_customer or new_status = 'ACTIVE',
      paypal_payer_id = coalesce(payer_id, paypal_payer_id),
      paypal_subscription_id = subscription_id,
      paypal_subscription_plan_id = paypal_plan_id,
      subscription_status = new_status,
      subscription_period_start = case when new_status = 'ACTIVE' then period_start else subscription_period_start end,
      subscription_period_end = case when new_status = 'ACTIVE' then period_end else subscription_period_end end,
      subscription_status_updated_at = status_updated_at,
      plan = next_plan,
      pending_plan = next_pending,
      billing_interval = new_interval,
      grace_until = case
        when new_status = 'ACTIVE' then null
        when new_status = 'SUSPENDED' then coalesce(grace_until, timezone('utc', now()) + interval '7 days')
        else grace_until
      end
  where owner_id = target_owner_id;

  return true;
end;
$$;

-- A failed renewal starts seven days of grace. The plan stays in force and
-- the dashboard asks for a new payment method.
create or replace function public.mark_paypal_payment_failed(subscription_id text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  with updated as (
    update public.billing_accounts
    set grace_until = coalesce(grace_until, timezone('utc', now()) + interval '7 days')
    where paypal_subscription_id = subscription_id
      and plan in ('starter', 'pro')
    returning 1
  )
  select exists (select 1 from updated);
$$;

create or replace function public.paypal_webhook_event_seen(target_event_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (select 1 from public.paypal_webhook_events where event_id = target_event_id);
$$;

revoke all on function public.sync_paypal_plan(uuid, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_paypal_payment_failed(text) from public, anon, authenticated;
revoke all on function public.paypal_webhook_event_seen(text) from public, anon, authenticated;
grant execute on function public.sync_paypal_plan(uuid, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz) to tagworks_ingest;
grant execute on function public.mark_paypal_payment_failed(text) to tagworks_ingest;
grant execute on function public.paypal_webhook_event_seen(text) to tagworks_ingest;

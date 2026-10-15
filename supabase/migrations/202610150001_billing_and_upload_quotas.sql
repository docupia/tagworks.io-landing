-- PayPal-backed billing entitlements and transaction-safe upload quotas.
--
-- Browser roles cannot read or mutate billing records. The trusted web service
-- reaches the small SECURITY DEFINER surface below through tagworks_ingest.

create table public.billing_accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  paid_customer boolean not null default false,
  paypal_payer_id text,
  paypal_subscription_id text unique,
  paypal_subscription_plan_id text,
  subscription_status text,
  subscription_period_start timestamptz,
  subscription_period_end timestamptz,
  subscription_status_updated_at timestamptz,
  monthly_uploads_used integer not null default 0,
  prepaid_uploads_granted integer not null default 0,
  prepaid_uploads_remaining integer not null default 0,
  free_uploads_used integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_accounts_status check (
    subscription_status is null or subscription_status in (
      'APPROVAL_PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'
    )
  ),
  constraint billing_accounts_usage_nonnegative check (
    monthly_uploads_used >= 0
    and prepaid_uploads_granted >= 0
    and prepaid_uploads_remaining >= 0
    and prepaid_uploads_remaining <= prepaid_uploads_granted
    and free_uploads_used between 0 and 1
  ),
  constraint billing_accounts_period_order check (
    subscription_period_start is null
    or subscription_period_end is null
    or subscription_period_end > subscription_period_start
  )
);

create trigger billing_accounts_set_updated_at
before update on public.billing_accounts
for each row execute function public.set_updated_at();

-- Existing owners have already used the free lifetime upload. Backfill before
-- the new quota functions become available so deployment does not grant an
-- extra free page to established accounts.
insert into public.billing_accounts (owner_id, free_uploads_used)
select page.owner_id, 1
from public.pages as page
group by page.owner_id
on conflict (owner_id) do update
set free_uploads_used = greatest(public.billing_accounts.free_uploads_used, 1);

create table public.paypal_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  paypal_order_id text not null unique,
  paypal_capture_id text not null unique,
  paypal_payer_id text,
  amount numeric(12, 2) not null,
  currency_code text not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint paypal_payments_kind check (kind = 'prepaid_300'),
  constraint paypal_payments_amount check (amount = 100.00),
  constraint paypal_payments_currency check (currency_code = 'USD')
);

create index paypal_payments_owner_created_idx
  on public.paypal_payments (owner_id, created_at desc);

create table public.paypal_webhook_events (
  event_id text primary key,
  event_type text not null,
  resource_id text,
  occurred_at timestamptz,
  processed_at timestamptz not null default timezone('utc', now())
);

alter table public.upload_reservations
  add column quota_source text,
  add column quota_period_start timestamptz,
  add constraint upload_reservations_quota_source check (
    quota_source is null or quota_source in ('free', 'monthly', 'prepaid')
  );

alter table public.billing_accounts enable row level security;
alter table public.paypal_payments enable row level security;
alter table public.paypal_webhook_events enable row level security;

revoke all on table public.billing_accounts from public, anon, authenticated, tagworks_ingest;
revoke all on table public.paypal_payments from public, anon, authenticated, tagworks_ingest;
revoke all on table public.paypal_webhook_events from public, anon, authenticated, tagworks_ingest;

create or replace function public.get_upload_entitlement(target_owner_id uuid)
returns table (
  tier text,
  paid_customer boolean,
  subscription_status text,
  subscription_period_end timestamptz,
  monthly_limit integer,
  monthly_used integer,
  monthly_remaining integer,
  prepaid_granted integer,
  prepaid_remaining integer,
  free_remaining integer,
  total_remaining integer,
  can_upload boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  account public.billing_accounts%rowtype;
  monthly_active boolean;
  monthly_left integer;
  free_left integer;
begin
  insert into public.billing_accounts (owner_id)
  values (target_owner_id)
  on conflict (owner_id) do nothing;

  select * into account
  from public.billing_accounts
  where owner_id = target_owner_id;

  monthly_active := account.subscription_status = 'ACTIVE'
    and account.subscription_period_end > timezone('utc', now());
  monthly_left := case
    when monthly_active then greatest(50 - account.monthly_uploads_used, 0)
    else 0
  end;
  free_left := case
    when account.paid_customer then 0
    else greatest(1 - account.free_uploads_used, 0)
  end;

  return query select
    case
      when monthly_active then 'monthly'::text
      when account.paid_customer then 'prepaid'::text
      else 'free'::text
    end,
    account.paid_customer,
    account.subscription_status,
    account.subscription_period_end,
    50,
    account.monthly_uploads_used,
    monthly_left,
    account.prepaid_uploads_granted,
    account.prepaid_uploads_remaining,
    free_left,
    monthly_left + account.prepaid_uploads_remaining + free_left,
    monthly_left + account.prepaid_uploads_remaining + free_left > 0;
end;
$$;

create or replace function public.reserve_upload_quota(
  target_owner_id uuid,
  reservation_id uuid,
  target_object_path text
)
returns table (
  allowed boolean,
  quota_source text,
  total_remaining integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  account public.billing_accounts%rowtype;
  selected_source text;
  expired_free integer := 0;
  expired_prepaid integer := 0;
  expired_monthly integer := 0;
  remaining_after integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_owner_id::text, 71));

  insert into public.billing_accounts (owner_id)
  values (target_owner_id)
  on conflict (owner_id) do nothing;

  select * into account
  from public.billing_accounts
  where owner_id = target_owner_id
  for update;

  delete from public.upload_reservations
  where owner_id = target_owner_id
    and consumed_at is not null
    and created_at < timezone('utc', now()) - interval '30 days';

  select
    count(*) filter (where expired_reservation.quota_source = 'free')::integer,
    count(*) filter (where expired_reservation.quota_source = 'prepaid')::integer,
    count(*) filter (
      where expired_reservation.quota_source = 'monthly'
        and expired_reservation.quota_period_start is not distinct from account.subscription_period_start
    )::integer
  into expired_free, expired_prepaid, expired_monthly
  from public.upload_reservations as expired_reservation
  where expired_reservation.owner_id = target_owner_id
    and expired_reservation.consumed_at is null
    and expired_reservation.expires_at <= timezone('utc', now());

  if expired_free + expired_prepaid + expired_monthly > 0 then
    update public.billing_accounts
    set free_uploads_used = greatest(free_uploads_used - expired_free, 0),
        prepaid_uploads_remaining = least(
          prepaid_uploads_granted,
          prepaid_uploads_remaining + expired_prepaid
        ),
        monthly_uploads_used = greatest(monthly_uploads_used - expired_monthly, 0)
    where owner_id = target_owner_id;
  end if;

  delete from public.upload_reservations
  where owner_id = target_owner_id
    and consumed_at is null
    and expires_at <= timezone('utc', now());

  select * into account
  from public.billing_accounts
  where owner_id = target_owner_id;

  if account.subscription_status = 'ACTIVE'
    and account.subscription_period_end > timezone('utc', now())
    and account.monthly_uploads_used < 50 then
    selected_source := 'monthly';
    update public.billing_accounts
    set monthly_uploads_used = monthly_uploads_used + 1
    where owner_id = target_owner_id;
  elsif account.prepaid_uploads_remaining > 0 then
    selected_source := 'prepaid';
    update public.billing_accounts
    set prepaid_uploads_remaining = prepaid_uploads_remaining - 1
    where owner_id = target_owner_id;
  elsif not account.paid_customer and account.free_uploads_used < 1 then
    selected_source := 'free';
    update public.billing_accounts
    set free_uploads_used = free_uploads_used + 1
    where owner_id = target_owner_id;
  else
    return query select false, null::text, 0;
    return;
  end if;

  insert into public.upload_reservations (
    id,
    owner_id,
    object_path,
    quota_source,
    quota_period_start
  ) values (
    reservation_id,
    target_owner_id,
    target_object_path,
    selected_source,
    case when selected_source = 'monthly' then account.subscription_period_start end
  );

  select entitlement.total_remaining into remaining_after
  from public.get_upload_entitlement(target_owner_id) as entitlement;

  return query select true, selected_source, remaining_after;
end;
$$;

create or replace function public.release_upload_quota(
  target_owner_id uuid,
  reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  reservation public.upload_reservations%rowtype;
  account public.billing_accounts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_owner_id::text, 71));

  select * into reservation
  from public.upload_reservations
  where id = reservation_id
    and owner_id = target_owner_id
    and consumed_at is null
  for update;

  if not found then
    return false;
  end if;

  select * into account
  from public.billing_accounts
  where owner_id = target_owner_id
  for update;

  if reservation.quota_source = 'free' then
    update public.billing_accounts
    set free_uploads_used = greatest(free_uploads_used - 1, 0)
    where owner_id = target_owner_id;
  elsif reservation.quota_source = 'prepaid' then
    update public.billing_accounts
    set prepaid_uploads_remaining = least(
      prepaid_uploads_granted,
      prepaid_uploads_remaining + 1
    )
    where owner_id = target_owner_id;
  elsif reservation.quota_source = 'monthly'
    and reservation.quota_period_start is not distinct from account.subscription_period_start then
    update public.billing_accounts
    set monthly_uploads_used = greatest(monthly_uploads_used - 1, 0)
    where owner_id = target_owner_id;
  end if;

  delete from public.upload_reservations
  where id = reservation_id
    and owner_id = target_owner_id
    and consumed_at is null;

  return true;
end;
$$;

create or replace function public.consume_upload_quota(
  target_owner_id uuid,
  reservation_id uuid
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  with consumed as (
    update public.upload_reservations
    set consumed_at = timezone('utc', now())
    where id = reservation_id
      and owner_id = target_owner_id
      and consumed_at is null
      and expires_at > timezone('utc', now())
    returning 1
  )
  select exists (select 1 from consumed);
$$;

create or replace function public.grant_paypal_prepaid_pack(
  target_owner_id uuid,
  order_id text,
  capture_id text,
  payer_id text,
  amount numeric,
  currency_code text,
  completed_at timestamptz
)
returns table (applied boolean, prepaid_remaining integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  inserted_payment uuid;
  existing_owner uuid;
  remaining integer;
begin
  if amount <> 100.00 or currency_code <> 'USD' then
    raise exception 'unexpected PayPal prepaid pack amount or currency'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_owner_id::text, 72));

  insert into public.paypal_payments (
    owner_id,
    kind,
    paypal_order_id,
    paypal_capture_id,
    paypal_payer_id,
    amount,
    currency_code,
    completed_at
  ) values (
    target_owner_id,
    'prepaid_300',
    order_id,
    capture_id,
    payer_id,
    amount,
    currency_code,
    completed_at
  )
  on conflict do nothing
  returning id into inserted_payment;

  if inserted_payment is null then
    select owner_id into existing_owner
    from public.paypal_payments
    where paypal_order_id = order_id
       or paypal_capture_id = capture_id
    limit 1;

    if existing_owner is distinct from target_owner_id then
      raise exception 'PayPal payment identity conflict'
        using errcode = '23505';
    end if;

    select account.prepaid_uploads_remaining into remaining
    from public.billing_accounts as account
    where account.owner_id = target_owner_id;

    return query select false, coalesce(remaining, 0);
    return;
  end if;

  insert into public.billing_accounts (
    owner_id,
    paid_customer,
    paypal_payer_id,
    prepaid_uploads_granted,
    prepaid_uploads_remaining
  ) values (
    target_owner_id,
    true,
    payer_id,
    300,
    300
  )
  on conflict (owner_id) do update
  set paid_customer = true,
      paypal_payer_id = coalesce(excluded.paypal_payer_id, public.billing_accounts.paypal_payer_id),
      prepaid_uploads_granted = public.billing_accounts.prepaid_uploads_granted + 300,
      prepaid_uploads_remaining = public.billing_accounts.prepaid_uploads_remaining + 300;

  select account.prepaid_uploads_remaining into remaining
  from public.billing_accounts as account
  where account.owner_id = target_owner_id;

  return query select true, remaining;
end;
$$;

create or replace function public.sync_paypal_subscription(
  target_owner_id uuid,
  subscription_id text,
  plan_id text,
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
  should_reset boolean := false;
begin
  if new_status not in (
    'APPROVAL_PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'
  ) then
    raise exception 'unsupported PayPal subscription status'
      using errcode = '22023';
  end if;

  if new_status = 'ACTIVE' and (period_start is null or period_end <= period_start) then
    raise exception 'active PayPal subscription requires a valid billing period'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_owner_id::text, 73));

  insert into public.billing_accounts (owner_id)
  values (target_owner_id)
  on conflict (owner_id) do nothing;

  select * into account
  from public.billing_accounts
  where owner_id = target_owner_id
  for update;

  if account.paypal_subscription_id is not null
    and account.paypal_subscription_id is distinct from subscription_id
    and account.subscription_status = 'ACTIVE'
    and account.subscription_period_end > timezone('utc', now()) then
    return false;
  end if;

  if account.subscription_status_updated_at is not null
    and status_updated_at < account.subscription_status_updated_at
    and subscription_id = account.paypal_subscription_id then
    return false;
  end if;

  should_reset := new_status = 'ACTIVE' and (
    account.paypal_subscription_id is distinct from subscription_id
    or account.subscription_period_start is null
    or period_start > account.subscription_period_start
  );

  update public.billing_accounts
  set paid_customer = paid_customer or new_status = 'ACTIVE',
      paypal_payer_id = coalesce(payer_id, paypal_payer_id),
      paypal_subscription_id = subscription_id,
      paypal_subscription_plan_id = plan_id,
      subscription_status = new_status,
      subscription_period_start = case
        when new_status = 'ACTIVE' then period_start
        else subscription_period_start
      end,
      subscription_period_end = case
        when new_status = 'ACTIVE' then period_end
        else subscription_period_end
      end,
      subscription_status_updated_at = status_updated_at,
      monthly_uploads_used = case when should_reset then 0 else monthly_uploads_used end
  where owner_id = target_owner_id;

  return true;
end;
$$;

create or replace function public.record_paypal_webhook_event(
  event_id text,
  event_type text,
  resource_id text,
  occurred_at timestamptz
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  with inserted as (
    insert into public.paypal_webhook_events (
      event_id, event_type, resource_id, occurred_at
    ) values (
      $1, $2, $3, $4
    )
    on conflict (event_id) do nothing
    returning 1
  )
  select exists (select 1 from inserted);
$$;

revoke all on function public.get_upload_entitlement(uuid) from public, anon, authenticated;
revoke all on function public.reserve_upload_quota(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.release_upload_quota(uuid, uuid) from public, anon, authenticated;
revoke all on function public.consume_upload_quota(uuid, uuid) from public, anon, authenticated;
revoke all on function public.grant_paypal_prepaid_pack(uuid, text, text, text, numeric, text, timestamptz) from public, anon, authenticated;
revoke all on function public.sync_paypal_subscription(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.record_paypal_webhook_event(text, text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.get_upload_entitlement(uuid) to tagworks_ingest;
grant execute on function public.reserve_upload_quota(uuid, uuid, text) to tagworks_ingest;
grant execute on function public.release_upload_quota(uuid, uuid) to tagworks_ingest;
grant execute on function public.consume_upload_quota(uuid, uuid) to tagworks_ingest;
grant execute on function public.grant_paypal_prepaid_pack(uuid, text, text, text, numeric, text, timestamptz) to tagworks_ingest;
grant execute on function public.sync_paypal_subscription(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz) to tagworks_ingest;
grant execute on function public.record_paypal_webhook_event(text, text, text, timestamptz) to tagworks_ingest;

comment on table public.billing_accounts is
  'Server-only PayPal billing state and upload entitlements.';
comment on table public.paypal_payments is
  'Idempotent ledger for completed one-time PayPal credit-pack captures.';

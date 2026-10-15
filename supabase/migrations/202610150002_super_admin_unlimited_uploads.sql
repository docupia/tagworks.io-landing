-- Explicit service-level super administrators have unlimited HTML publishing.
-- The flag remains private to the trusted billing function surface.

alter table public.billing_accounts
  add column is_super_admin boolean not null default false;

comment on column public.billing_accounts.is_super_admin is
  'Trusted service administrator. Unlimited uploads are reserved without decrementing a balance.';

alter table public.upload_reservations
  drop constraint upload_reservations_quota_source;

alter table public.upload_reservations
  add constraint upload_reservations_quota_source check (
    quota_source is null or quota_source in ('free', 'monthly', 'prepaid', 'admin')
  );

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
    when account.is_super_admin then 0
    when monthly_active then greatest(50 - account.monthly_uploads_used, 0)
    else 0
  end;
  free_left := case
    when account.is_super_admin or account.paid_customer then 0
    else greatest(1 - account.free_uploads_used, 0)
  end;

  return query select
    case
      when account.is_super_admin then 'admin'::text
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
    case
      when account.is_super_admin then 2147483647
      else monthly_left + account.prepaid_uploads_remaining + free_left
    end,
    account.is_super_admin
      or monthly_left + account.prepaid_uploads_remaining + free_left > 0;
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

  if account.is_super_admin then
    selected_source := 'admin';
  elsif account.subscription_status = 'ACTIVE'
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

-- This is the explicitly requested initial service super administrator.
insert into public.billing_accounts (owner_id, is_super_admin)
select id, true
from auth.users
where lower(email) = 'docupia@gmail.com'
on conflict (owner_id) do update
set is_super_admin = true;

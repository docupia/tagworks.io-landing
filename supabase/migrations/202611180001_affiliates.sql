create table public.affiliates (
  owner_id uuid primary key references auth.users(id),
  code uuid not null unique default gen_random_uuid(),
  paypal_email text not null check (length(paypal_email) between 3 and 254),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create table public.affiliate_referrals (
  member_id uuid primary key references auth.users(id),
  affiliate_id uuid not null references public.affiliates(owner_id),
  created_at timestamptz not null default now(),
  check (member_id <> affiliate_id)
);
create table public.affiliate_transactions (
  transaction_id text primary key,
  parent_id text,
  subscription_id text,
  member_id uuid references auth.users(id),
  amount numeric(12,2) not null,
  currency text not null,
  occurred_at timestamptz not null,
  kind text not null check (kind in ('sale','refund'))
);
create table public.affiliate_settlements (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(owner_id),
  month date not null check (extract(day from month) = 1),
  currency text not null,
  amount numeric(12,2) not null check (amount > 0),
  paypal_email text not null,
  payment_reference text not null unique check (length(trim(payment_reference)) > 0),
  paid_at timestamptz not null default now(),
  unique (affiliate_id, month, currency)
);
-- Browser roles have no direct access. Every runtime query uses the authenticated
-- owner ID verified by the server, with separate checks for the administrator.
alter table public.affiliates enable row level security;
alter table public.affiliate_referrals enable row level security;
alter table public.affiliate_transactions enable row level security;
alter table public.affiliate_settlements enable row level security;
revoke all on public.affiliates, public.affiliate_referrals, public.affiliate_transactions, public.affiliate_settlements from public, anon, authenticated;
grant select, insert, update on public.affiliates to tagworks_ingest;
grant select, insert on public.affiliate_referrals, public.affiliate_transactions, public.affiliate_settlements to tagworks_ingest;
create policy affiliates_ingest on public.affiliates to tagworks_ingest using (true) with check (true);
create policy affiliate_referrals_ingest on public.affiliate_referrals to tagworks_ingest using (true) with check (true);
create policy affiliate_transactions_ingest on public.affiliate_transactions to tagworks_ingest using (true) with check (true);
create policy affiliate_settlements_ingest on public.affiliate_settlements to tagworks_ingest using (true) with check (true);

create function public.attach_affiliate(member uuid, referral_code uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.affiliate_referrals(member_id, affiliate_id)
  select u.id, a.owner_id from auth.users u, public.affiliates a
  where u.id = member and a.code = referral_code and u.id <> a.owner_id
    and u.created_at > now() - interval '10 minutes'
  on conflict (member_id) do nothing;
$$;
revoke all on function public.attach_affiliate(uuid,uuid) from public;
grant execute on function public.attach_affiliate(uuid,uuid) to tagworks_ingest;

create function public.record_affiliate_payment(payment_id text, parent text, subscription text,
  value numeric, denomination text, happened timestamptz, payment_kind text)
returns void language sql security definer set search_path = '' as $$
  insert into public.affiliate_transactions(transaction_id,parent_id,subscription_id,member_id,amount,currency,occurred_at,kind)
  values (payment_id,parent,subscription,
    coalesce((select owner_id from public.paypal_payments where paypal_capture_id = payment_id),
      (select owner_id from public.billing_accounts where paypal_subscription_id = subscription)),
    value,denomination,happened,payment_kind)
  on conflict (transaction_id) do nothing;
$$;
revoke all on function public.record_affiliate_payment(text,text,text,numeric,text,timestamptz,text) from public;
grant execute on function public.record_affiliate_payment(text,text,text,numeric,text,timestamptz,text) to tagworks_ingest;

-- Capture-return and webhook retries converge on the existing unique capture ID.
create function public.affiliate_capture_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.affiliate_transactions(transaction_id,member_id,amount,currency,occurred_at,kind)
  values(new.paypal_capture_id,new.owner_id,new.amount,new.currency_code,new.completed_at,'sale')
  on conflict (transaction_id) do nothing;
  return new;
end;
$$;
create trigger affiliate_capture after insert on public.paypal_payments
for each row execute function public.affiliate_capture_payment();

create view public.affiliate_revenue as
select r.affiliate_id, date_trunc('month',t.occurred_at at time zone 'UTC')::date as month,
 t.currency, sum(t.amount) as revenue
from public.affiliate_transactions t
left join public.affiliate_transactions parent on parent.transaction_id = t.parent_id and parent.kind = 'sale'
left join public.billing_accounts account on account.paypal_subscription_id = coalesce(t.subscription_id,parent.subscription_id)
join public.affiliate_referrals r on r.member_id = coalesce(t.member_id,parent.member_id,account.owner_id)
where t.occurred_at >= r.created_at
group by r.affiliate_id, date_trunc('month',t.occurred_at at time zone 'UTC')::date,t.currency;
grant select on public.affiliate_revenue to tagworks_ingest;

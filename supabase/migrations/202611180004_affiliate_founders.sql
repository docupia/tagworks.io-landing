-- Award a permanent 20 percentage-point bonus on first positive referred sale.
create table public.affiliate_founders (
  affiliate_id uuid primary key references public.affiliates(owner_id),
  position integer not null unique check (position between 1 and 100),
  qualified_at timestamptz not null,
  transaction_id text not null
);
alter table public.affiliate_founders enable row level security;
revoke all on public.affiliate_founders from public, anon, authenticated;
grant select on public.affiliate_founders to tagworks_ingest;
create policy affiliate_founders_ingest on public.affiliate_founders
for select to tagworks_ingest using (true);

create function public.award_affiliate_founder()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recipient uuid;
  next_position integer;
begin
  if new.kind <> 'sale' or new.amount <= 0 then return new; end if;
  select r.affiliate_id into recipient
  from public.affiliate_referrals r
  left join public.billing_accounts a on a.paypal_subscription_id = new.subscription_id
  where r.member_id = coalesce(new.member_id,a.owner_id)
    and new.occurred_at >= r.created_at;
  if recipient is null then return new; end if;

  -- A transaction-scoped lock serializes allocation across all affiliates.
  perform pg_catalog.pg_advisory_xact_lock(18112026,100);
  if exists(select 1 from public.affiliate_founders where affiliate_id=recipient) then
    return new;
  end if;
  select coalesce(max(position),0)+1 into next_position from public.affiliate_founders;
  if next_position <= 100 then
    insert into public.affiliate_founders(affiliate_id,position,qualified_at,transaction_id)
    values(recipient,next_position,new.occurred_at,new.transaction_id);
  end if;
  return new;
end;
$$;

-- Include already-recorded first sales when introducing this policy.
insert into public.affiliate_founders(affiliate_id,position,qualified_at,transaction_id)
select affiliate_id, row_number() over(order by occurred_at,transaction_id,affiliate_id)::integer,
 occurred_at,transaction_id
from (
  select distinct on (r.affiliate_id) r.affiliate_id,t.occurred_at,t.transaction_id
  from public.affiliate_transactions t
  left join public.billing_accounts a on a.paypal_subscription_id=t.subscription_id
  join public.affiliate_referrals r on r.member_id=coalesce(t.member_id,a.owner_id)
  where t.kind='sale' and t.amount>0 and t.occurred_at>=r.created_at
  order by r.affiliate_id,t.occurred_at,t.transaction_id
) first_sales
order by occurred_at,transaction_id,affiliate_id
limit 100;

create trigger award_affiliate_founder after insert on public.affiliate_transactions
for each row execute function public.award_affiliate_founder();

create or replace view public.affiliate_commissions as
select r.affiliate_id,r.month,r.currency,r.revenue,
  case when f.affiliate_id is not null then 0.30 else 0.10 end::numeric as commission_rate,
  round(r.revenue * case when f.affiliate_id is not null then 0.30 else 0.10 end,2) as commission
from public.affiliate_revenue r
left join public.affiliate_founders f on f.affiliate_id=r.affiliate_id;

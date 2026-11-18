-- Include settlement-only months so later refunds cannot hide earlier payments.
create view public.affiliate_balances as
with months as (
  select affiliate_id, month, currency from public.affiliate_commissions
  union
  select affiliate_id, month, currency from public.affiliate_settlements
), ledger as (
  select m.affiliate_id, m.month, m.currency,
    coalesce(c.revenue,0) as revenue,
    coalesce(c.commission,0) as commission,
    coalesce(s.amount,0) as paid
  from months m
  left join public.affiliate_commissions c using (affiliate_id,month,currency)
  left join public.affiliate_settlements s using (affiliate_id,month,currency)
)
select *,
  coalesce(sum(commission-paid) over (
    partition by affiliate_id,currency order by month
    rows between unbounded preceding and 1 preceding
  ),0) as opening_balance,
  sum(commission-paid) over (
    partition by affiliate_id,currency order by month
    rows between unbounded preceding and current row
  ) as balance
from ledger;
grant select on public.affiliate_balances to tagworks_ingest;

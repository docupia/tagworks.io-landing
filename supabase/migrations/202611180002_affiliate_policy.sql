alter table public.affiliates alter column status set default 'approved';
update public.affiliates set status = 'approved' where status = 'pending';

create view public.affiliate_commissions as
select affiliate_id, month, currency, revenue,
  0.10::numeric as commission_rate,
  round(revenue * 0.10, 2) as commission
from public.affiliate_revenue;
grant select on public.affiliate_commissions to tagworks_ingest;

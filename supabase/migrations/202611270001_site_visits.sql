-- Visitors to the TagWorks marketing site (tagworks.io), counted per day.
-- A visitor is a random first-party cookie id; no IP address or user agent is stored.
-- Days follow Asia/Seoul time.
create table public.site_daily_visitors (
  visit_date date not null,
  visitor_id uuid not null,
  primary key (visit_date, visitor_id)
);
alter table public.site_daily_visitors enable row level security;
revoke all on public.site_daily_visitors from public, anon, authenticated;

create function public.record_site_visit(visitor uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.site_daily_visitors (visit_date, visitor_id)
  values ((pg_catalog.now() at time zone 'Asia/Seoul')::date, visitor)
  on conflict (visit_date, visitor_id) do nothing;
$$;
revoke all on function public.record_site_visit(uuid) from public;
grant execute on function public.record_site_visit(uuid) to tagworks_ingest;

-- Unique visitors are distinct across the whole range, not a sum of daily counts.
create function public.get_site_visit_summary()
returns table (range_days integer, visitors bigint)
language sql stable security definer set search_path = '' as $$
  with today as (select (pg_catalog.now() at time zone 'Asia/Seoul')::date as day)
  select r.days,
    count(distinct v.visitor_id)
  from (values (1), (7), (30)) as r(days)
  cross join today
  left join public.site_daily_visitors v
    on v.visit_date > today.day - r.days and v.visit_date <= today.day
  group by r.days
  order by r.days;
$$;
revoke all on function public.get_site_visit_summary() from public;
grant execute on function public.get_site_visit_summary() to tagworks_ingest;

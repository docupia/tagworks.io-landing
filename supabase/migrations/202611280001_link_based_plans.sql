-- Link-based plans.
--
-- Billing moves from upload counts to the number of live (published) links.
-- Plan limits live in apps/web/lib/plans.ts. The database stores only which
-- plan an account is on, admin overrides for custom accounts, and the state
-- needed to enforce the live-link count atomically.

-- Accounts ---------------------------------------------------------------

alter table public.billing_accounts
  add column plan text not null default 'free',
  add column plan_overrides jsonb not null default '{}'::jsonb,
  add column custom_price_usd numeric(10, 2),
  add column contract_note text,
  add column pending_plan text,
  add column grace_until timestamptz,
  add constraint billing_accounts_plan check (plan in ('free', 'starter', 'pro', 'custom')),
  add constraint billing_accounts_pending_plan check (
    pending_plan is null or pending_plan in ('free', 'starter', 'pro')
  ),
  add constraint billing_accounts_plan_overrides_shape check (jsonb_typeof(plan_overrides) = 'object'),
  add constraint billing_accounts_custom_price check (custom_price_usd is null or custom_price_usd >= 0),
  add constraint billing_accounts_contract_note_length check (
    contract_note is null or char_length(contract_note) <= 2000
  );

comment on column public.billing_accounts.plan is
  'free, starter or pro follow the PayPal subscription; custom is set by an administrator.';
comment on column public.billing_accounts.plan_overrides is
  'Custom-plan limits that replace plan defaults, e.g. {"maxLinks": 100, "monthlyViews": 200000}.';
comment on column public.billing_accounts.pending_plan is
  'Downgrade scheduled for the end of the paid period.';

-- Pages ------------------------------------------------------------------

-- Edits are unlimited now, so the old three-revision cap no longer applies.
alter table public.pages drop constraint if exists pages_revision_count_check;

alter table public.pages
  add column unpublished_reason text,
  add column keep_on_downgrade boolean not null default false,
  add column last_edited_at timestamptz,
  add constraint pages_unpublished_reason check (
    unpublished_reason is null or unpublished_reason in ('user', 'downgrade', 'admin')
  );

update public.pages
set last_edited_at = coalesce(published_at, created_at)
where deleted_at is null;

create index pages_owner_live_idx
  on public.pages (owner_id)
  where status = 'published' and deleted_at is null;

-- HTML may now be up to 2 MiB. The sanitized artifact grows when local image
-- paths are replaced with storage URLs, so it gets extra headroom.
alter table public.page_versions drop constraint page_versions_source_size;
alter table public.page_versions
  add constraint page_versions_source_size check (source_bytes between 1 and 2097152);
alter table public.page_versions drop constraint page_versions_html_size;
alter table public.page_versions
  add constraint page_versions_html_size check (
    octet_length(sanitized_html) between 1 and 4194304
  );

-- Edit log for the per-link hourly edit limit. Rows older than a day are
-- removed whenever the limit is checked.
create table public.page_edits (
  id bigint generated always as identity primary key,
  page_id uuid not null references public.pages(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  edited_at timestamptz not null default timezone('utc', now())
);

create index page_edits_page_time_idx on public.page_edits (page_id, edited_at desc);

alter table public.page_edits enable row level security;
revoke all on table public.page_edits from public, anon, authenticated, tagworks_ingest;

grant select (
  slug, title, description, published_version_id, published_at, updated_at,
  unpublished_reason, keep_on_downgrade, last_edited_at
) on public.pages to tagworks_ingest;
grant update (unpublished_reason, keep_on_downgrade, last_edited_at)
  on public.pages to tagworks_ingest;

-- Plan state ---------------------------------------------------------------

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
  paid_active boolean;
  current_plan text;
begin
  insert into public.billing_accounts (owner_id)
  values (target_owner_id)
  on conflict (owner_id) do nothing;

  select * into account
  from public.billing_accounts
  where owner_id = target_owner_id;

  -- A paid plan stays in force while PayPal reports the subscription active
  -- (with seven days of grace after a missed renewal), until the end of an
  -- already-paid period after cancellation, or during an explicit payment
  -- failure grace period.
  paid_active := account.plan in ('starter', 'pro') and (
    (account.subscription_status = 'ACTIVE'
      and coalesce(account.subscription_period_end, timezone('utc', now()))
        > timezone('utc', now()) - interval '7 days')
    or (account.subscription_status in ('CANCELLED', 'SUSPENDED', 'EXPIRED')
      and account.subscription_period_end > timezone('utc', now()))
    or account.grace_until > timezone('utc', now())
  );

  current_plan := case
    when account.is_super_admin or account.plan = 'custom' then 'custom'
    when paid_active and account.pending_plan is not null
      and account.subscription_period_end <= timezone('utc', now()) then account.pending_plan
    when paid_active then account.plan
    else 'free'
  end;

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

-- Keeps the number of live links within max_links. Extra links are made
-- private (never deleted), keeping the ones the owner chose first and then
-- the most recently edited. Links closed by an earlier downgrade come back
-- automatically when room opens up again, for example after resubscribing.
create or replace function public.reconcile_live_links(
  target_owner_id uuid,
  max_links integer
)
returns table (closed integer, restored integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  live integer;
  closed_count integer := 0;
  restored_count integer := 0;
begin
  if max_links is null or max_links < 0 then
    raise exception 'max_links must be zero or more' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_owner_id::text, 81));

  select count(*)::integer into live
  from public.pages
  where owner_id = target_owner_id and status = 'published' and deleted_at is null;

  if live > max_links then
    with ranked as (
      select id
      from public.pages
      where owner_id = target_owner_id and status = 'published' and deleted_at is null
      order by keep_on_downgrade desc,
        coalesce(last_edited_at, published_at, created_at) desc,
        id
      offset max_links
    ), closed_rows as (
      update public.pages as page
      set status = 'paused', unpublished_reason = 'downgrade', updated_at = timezone('utc', now())
      from ranked
      where page.id = ranked.id
      returning 1
    )
    select count(*)::integer into closed_count from closed_rows;
  elsif live < max_links then
    with ranked as (
      select id
      from public.pages
      where owner_id = target_owner_id
        and status = 'paused'
        and unpublished_reason = 'downgrade'
        and deleted_at is null
        and published_version_id is not null
      order by keep_on_downgrade desc,
        coalesce(last_edited_at, published_at, created_at) desc,
        id
      limit max_links - live
    ), restored_rows as (
      update public.pages as page
      set status = 'published', unpublished_reason = null, updated_at = timezone('utc', now())
      from ranked
      where page.id = ranked.id
      returning 1
    )
    select count(*)::integer into restored_count from restored_rows;
  end if;

  return query select closed_count, restored_count;
end;
$$;

-- Owner-initiated publish/unpublish. Publishing checks the live-link limit
-- under the same lock that new uploads use.
create or replace function public.set_page_live(
  target_owner_id uuid,
  target_page_id uuid,
  make_live boolean,
  max_links integer
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  page public.pages%rowtype;
  live integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_owner_id::text, 81));

  select * into page
  from public.pages
  where id = target_page_id and owner_id = target_owner_id and deleted_at is null
  for update;

  if not found or page.published_version_id is null then
    return 'not_found';
  end if;

  if not make_live then
    if page.status = 'published' then
      update public.pages
      set status = 'paused', unpublished_reason = 'user', keep_on_downgrade = false,
          updated_at = timezone('utc', now())
      where id = target_page_id;
    end if;
    return 'ok';
  end if;

  if page.status = 'published' then
    return 'ok';
  end if;

  select count(*)::integer into live
  from public.pages
  where owner_id = target_owner_id and status = 'published' and deleted_at is null;

  if live >= max_links then
    return 'limit';
  end if;

  update public.pages
  set status = 'published', unpublished_reason = null, updated_at = timezone('utc', now())
  where id = target_page_id;
  return 'ok';
end;
$$;

-- Marks which live links stay public after a scheduled downgrade.
create or replace function public.set_links_kept_on_downgrade(
  target_owner_id uuid,
  page_ids uuid[]
)
returns integer
language sql
security definer
set search_path = pg_catalog, public
as $$
  with updated as (
    update public.pages
    set keep_on_downgrade = id = any(page_ids)
    where owner_id = target_owner_id and deleted_at is null
    returning keep_on_downgrade
  )
  select count(*) filter (where keep_on_downgrade)::integer from updated;
$$;

-- Returns seconds until another edit is allowed, or 0 when the edit may go
-- ahead. The edit itself is recorded by record_page_edit inside the publish
-- transaction.
create or replace function public.page_edit_retry_after(
  target_page_id uuid,
  edits_per_hour integer
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  recent integer;
  oldest timestamptz;
begin
  delete from public.page_edits
  where page_id = target_page_id
    and edited_at < timezone('utc', now()) - interval '1 day';

  select count(*)::integer, min(edited_at) into recent, oldest
  from (
    select edited_at
    from public.page_edits
    where page_id = target_page_id
      and edited_at > timezone('utc', now()) - interval '1 hour'
    order by edited_at desc
    limit greatest(edits_per_hour, 1)
  ) as window_rows;

  if recent < edits_per_hour then
    return 0;
  end if;

  return greatest(
    1,
    ceil(extract(epoch from (oldest + interval '1 hour' - timezone('utc', now()))))::integer
  );
end;
$$;

create or replace function public.record_page_edit(
  target_owner_id uuid,
  target_page_id uuid
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  insert into public.page_edits (page_id, owner_id) values (target_page_id, target_owner_id);
  update public.pages
  set last_edited_at = timezone('utc', now())
  where id = target_page_id and owner_id = target_owner_id and deleted_at is null;
$$;

-- Lets the publisher show a "temporarily closed" notice for private links
-- instead of a 404. Only the state is returned, never the content.
create or replace function public.get_page_availability(page_slug text)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case when page.status = 'published' then 'published' else 'closed' end
  from public.pages as page
  where page.slug = page_slug
    and page.status in ('published', 'paused')
    and page.deleted_at is null
  limit 1;
$$;

revoke all on function public.get_account_plan(uuid) from public, anon, authenticated;
revoke all on function public.reconcile_live_links(uuid, integer) from public, anon, authenticated;
revoke all on function public.set_page_live(uuid, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.set_links_kept_on_downgrade(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.page_edit_retry_after(uuid, integer) from public, anon, authenticated;
revoke all on function public.record_page_edit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_page_availability(text) from public;

grant execute on function public.get_account_plan(uuid) to tagworks_ingest;
grant execute on function public.reconcile_live_links(uuid, integer) to tagworks_ingest;
grant execute on function public.set_page_live(uuid, uuid, boolean, integer) to tagworks_ingest;
grant execute on function public.set_links_kept_on_downgrade(uuid, uuid[]) to tagworks_ingest;
grant execute on function public.page_edit_retry_after(uuid, integer) to tagworks_ingest;
grant execute on function public.record_page_edit(uuid, uuid) to tagworks_ingest;
grant execute on function public.get_page_availability(text) to anon, authenticated;

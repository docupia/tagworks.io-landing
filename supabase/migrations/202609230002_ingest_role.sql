-- Narrow database role for the trusted Next.js publishing route.
--
-- The role password is intentionally not stored in this migration. Provision it
-- separately, then use the Supavisor transaction-pooler URL in
-- SUPABASE_DATABASE_URL. The application never needs the postgres role.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tagworks_ingest') then
    create role tagworks_ingest;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_roles
    where rolname = 'tagworks_ingest'
      and (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)
  ) then
    raise exception 'existing tagworks_ingest role has unsafe elevated privileges';
  end if;
end;
$$;

alter role tagworks_ingest with
  login
  noinherit
  connection limit 20;

alter role tagworks_ingest set statement_timeout = '15s';
alter role tagworks_ingest set lock_timeout = '5s';
alter role tagworks_ingest set idle_in_transaction_session_timeout = '15s';

grant usage on schema public to tagworks_ingest;

revoke all on table public.pages from tagworks_ingest;
revoke all on table public.page_versions from tagworks_ingest;

grant select (id, owner_id, created_at)
on table public.pages
to tagworks_ingest;

grant insert (id, owner_id, slug, title, description, status)
on table public.pages
to tagworks_ingest;

grant update (status, published_version_id, published_at, updated_at)
on table public.pages
to tagworks_ingest;

grant select (id, page_id, sanitized_html)
on table public.page_versions
to tagworks_ingest;

grant insert (
  id,
  page_id,
  source_object_path,
  source_sha256,
  source_bytes,
  sanitized_html,
  sanitizer_version,
  warnings
)
on table public.page_versions
to tagworks_ingest;

drop policy if exists pages_ingest_read on public.pages;
create policy pages_ingest_read
on public.pages
for select
to tagworks_ingest
using (true);

drop policy if exists pages_ingest_create on public.pages;
create policy pages_ingest_create
on public.pages
for insert
to tagworks_ingest
with check (true);

drop policy if exists pages_ingest_publish on public.pages;
create policy pages_ingest_publish
on public.pages
for update
to tagworks_ingest
using (true)
with check (true);

drop policy if exists page_versions_ingest_read on public.page_versions;
create policy page_versions_ingest_read
on public.page_versions
for select
to tagworks_ingest
using (true);

drop policy if exists page_versions_ingest_create on public.page_versions;
create policy page_versions_ingest_create
on public.page_versions
for insert
to tagworks_ingest
with check (true);

comment on role tagworks_ingest is
  'Least-privilege login used only by the TagWorks trusted publishing route.';

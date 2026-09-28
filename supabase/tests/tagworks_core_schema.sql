-- Lightweight post-migration invariants.
-- Run with: psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1 \
--   -f supabase/tests/tagworks_core_schema.sql

begin;

do $$
declare
  missing_tables text[];
begin
  select array_agg(expected.name order by expected.name)
  into missing_tables
  from (
    values
      ('analytics_events'),
      ('analytics_sessions'),
      ('page_links'),
      ('pages'),
      ('page_versions'),
      ('upload_reservations')
  ) as expected(name)
  where to_regclass('public.' || expected.name) is null;

  if missing_tables is not null then
    raise exception 'missing application tables: %', missing_tables;
  end if;
end;
$$;

do $$
declare
  analytics_role pg_roles%rowtype;
begin
  select * into analytics_role
  from pg_roles
  where rolname = 'tagworks_analytics';

  if not found then
    raise exception 'tagworks_analytics role does not exist';
  end if;

  if analytics_role.rolsuper or analytics_role.rolcreaterole
    or analytics_role.rolcreatedb or analytics_role.rolreplication
    or analytics_role.rolbypassrls then
    raise exception 'tagworks_analytics must remain an unprivileged function-only role';
  end if;

  if has_table_privilege('tagworks_analytics', 'public.pages', 'SELECT')
    or has_table_privilege('tagworks_analytics', 'public.page_links', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('tagworks_analytics', 'public.analytics_sessions', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('tagworks_analytics', 'public.analytics_events', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'tagworks_analytics must not receive direct table privileges';
  end if;
end;
$$;

do $$
declare
  ingest_role pg_roles%rowtype;
begin
  select * into ingest_role
  from pg_roles
  where rolname = 'tagworks_ingest';

  if not found then
    raise exception 'tagworks_ingest role does not exist';
  end if;

  if ingest_role.rolsuper or ingest_role.rolcreaterole
    or ingest_role.rolcreatedb or ingest_role.rolreplication
    or ingest_role.rolbypassrls then
    raise exception 'tagworks_ingest must remain an unprivileged RLS-bound role';
  end if;

  if has_table_privilege('tagworks_ingest', 'public.pages', 'DELETE')
    or has_table_privilege('tagworks_ingest', 'public.page_versions', 'DELETE') then
    raise exception 'tagworks_ingest must not delete application records';
  end if;

  if has_column_privilege('tagworks_ingest', 'public.pages', 'owner_id', 'UPDATE')
    or has_column_privilege('tagworks_ingest', 'public.pages', 'slug', 'UPDATE')
    or has_column_privilege('tagworks_ingest', 'public.page_versions', 'sanitized_html', 'UPDATE') then
    raise exception 'tagworks_ingest can mutate immutable identity or artifact columns';
  end if;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'pages',
    'page_versions',
    'upload_reservations',
    'page_links',
    'analytics_sessions',
    'analytics_events'
  ]
  loop
    if not exists (
      select 1
      from pg_class as relation
      inner join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', table_name;
    end if;
  end loop;
end;
$$;

do $$
begin
  if has_table_privilege('anon', 'public.pages', 'SELECT')
    or has_table_privilege('anon', 'public.page_versions', 'SELECT')
    or has_table_privilege('anon', 'public.upload_reservations', 'SELECT')
    or has_table_privilege('anon', 'public.page_links', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('anon', 'public.analytics_sessions', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('anon', 'public.analytics_events', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.page_links', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.analytics_sessions', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.analytics_events', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.upload_reservations', 'SELECT') then
    raise exception 'anon must not have direct SELECT access to application tables';
  end if;

  if has_table_privilege('authenticated', 'public.pages', 'INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.page_versions', 'INSERT,UPDATE,DELETE') then
    raise exception 'authenticated must be read-only on application tables';
  end if;

  if not has_function_privilege(
    'anon',
    'public.get_published_page(text)',
    'EXECUTE'
  ) then
    raise exception 'anon requires EXECUTE on get_published_page(text)';
  end if;

  if has_function_privilege(
    'anon',
    'public.can_upload_page_original(text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.can_upload_page_original(text)',
    'EXECUTE'
  ) then
    raise exception 'upload reservation check has incorrect role grants';
  end if;

  if has_function_privilege(
    'anon',
    'public.sync_published_links(text,uuid,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.record_analytics_event(uuid,text,uuid,text,uuid,text,text,text,text,text,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.get_page_analytics(uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'anonymous callers must not invoke analytics collector or owner functions';
  end if;

  if not has_function_privilege(
    'tagworks_analytics',
    'public.sync_published_links(text,uuid,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'tagworks_analytics',
    'public.record_analytics_event(uuid,text,uuid,text,uuid,text,text,text,text,text,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'tagworks_analytics',
    'public.get_page_analytics(uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'analytics collector function privileges are not least-privilege';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_page_analytics(uuid,integer)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.get_owner_page_analytics_summary(integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated owners require aggregate analytics RPC access';
  end if;
end;
$$;

do $$
declare
  bucket storage.buckets%rowtype;
begin
  select * into bucket
  from storage.buckets
  where id = 'page-originals';

  if not found then
    raise exception 'page-originals bucket does not exist';
  end if;

  if bucket.public then
    raise exception 'page-originals bucket must remain private';
  end if;

  if bucket.file_size_limit is distinct from 1048576 then
    raise exception 'page-originals bucket size limit must be 1 MiB';
  end if;
end;
$$;

rollback;

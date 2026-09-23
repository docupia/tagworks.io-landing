-- Tagworks core schema
--
-- Security model:
--   * Browser sessions can only read their own metadata through RLS.
--   * Writes to the application tables are performed by the trusted web service
--     over its server-only PostgreSQL connection.
--   * Uploaded source documents live in a private Storage bucket.
--   * Anonymous visitors can only read the currently published, sanitized
--     artifact through get_published_page(text).

create extension if not exists pgcrypto with schema extensions;

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  title text not null,
  description text,
  status text not null default 'draft',
  published_version_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  published_at timestamptz,
  deleted_at timestamptz,
  constraint pages_slug_format check (
    char_length(slug) between 1 and 80
    and slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'
  ),
  constraint pages_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint pages_description_length check (
    description is null or char_length(description) <= 320
  ),
  constraint pages_status_value check (status in ('draft', 'published', 'paused', 'deleted')),
  constraint pages_deleted_state check (
    (status = 'deleted' and deleted_at is not null)
    or (status <> 'deleted' and deleted_at is null)
  )
);

create index pages_owner_updated_idx
  on public.pages (owner_id, updated_at desc);

create index pages_public_lookup_idx
  on public.pages (slug)
  where status = 'published' and deleted_at is null;

create table public.page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  source_object_path text not null unique,
  source_sha256 text not null,
  source_bytes integer not null,
  sanitized_html text not null,
  sanitizer_version text not null,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint page_versions_page_id_id_unique unique (page_id, id),
  constraint page_versions_object_path_length check (
    char_length(source_object_path) between 39 and 1024
  ),
  constraint page_versions_object_path_safe check (
    source_object_path !~ '(^/|//|(^|/)\.\.?(/|$))'
  ),
  constraint page_versions_source_hash check (source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint page_versions_source_size check (source_bytes between 1 and 1048576),
  constraint page_versions_html_size check (
    octet_length(sanitized_html) between 1 and 2097152
  ),
  constraint page_versions_sanitizer_version_length check (
    char_length(btrim(sanitizer_version)) between 1 and 80
  ),
  constraint page_versions_warnings_shape check (
    jsonb_typeof(warnings) in ('array', 'object')
  )
);

create index page_versions_page_created_idx
  on public.page_versions (page_id, created_at desc);

alter table public.pages
  add constraint pages_published_version_fk
  foreign key (id, published_version_id)
  references public.page_versions(page_id, id)
  deferrable initially deferred;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger pages_set_updated_at
before update on public.pages
for each row execute function public.set_updated_at();

create or replace function public.validate_page_version_owner_path()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  expected_owner_id uuid;
begin
  select page.owner_id
  into expected_owner_id
  from public.pages as page
  where page.id = new.page_id;

  if expected_owner_id is null then
    raise exception 'page does not exist'
      using errcode = '23503';
  end if;

  if split_part(new.source_object_path, '/', 1) <> expected_owner_id::text then
    raise exception 'original object path must begin with the page owner UUID'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger page_versions_validate_owner_path
before insert on public.page_versions
for each row execute function public.validate_page_version_owner_path();

create or replace function public.protect_page_identity_and_publication()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.owner_id is distinct from old.owner_id
      or new.slug is distinct from old.slug then
      raise exception 'page id, owner, and slug are immutable'
        using errcode = '22023';
    end if;

    if old.deleted_at is not null and new is distinct from old then
      raise exception 'deleted page tombstones are immutable'
        using errcode = '55000';
    end if;
  end if;

  if new.status = 'published' then
    if new.published_version_id is null then
      raise exception 'a published page requires a published version'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.page_versions as version
      where version.page_id = new.id
        and version.id = new.published_version_id
        and octet_length(version.sanitized_html) > 0
    ) then
      raise exception 'the published version requires a sanitized artifact'
        using errcode = '23514';
    end if;

    new.published_at := coalesce(new.published_at, timezone('utc', now()));
  end if;

  return new;
end;
$$;

create trigger zz_pages_protect_identity_and_publication
before insert or update on public.pages
for each row execute function public.protect_page_identity_and_publication();

create or replace function public.prevent_immutable_record_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception '% records are immutable; create a new version instead', tg_table_name
    using errcode = '55000';
end;
$$;

create trigger page_versions_are_immutable
before update on public.page_versions
for each row execute function public.prevent_immutable_record_update();

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.validate_page_version_owner_path() from public, anon, authenticated;
revoke all on function public.protect_page_identity_and_publication() from public, anon, authenticated;
revoke all on function public.prevent_immutable_record_update() from public, anon, authenticated;

alter table public.pages enable row level security;
alter table public.page_versions enable row level security;

create policy pages_owner_read
on public.pages
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy page_versions_owner_read
on public.page_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.pages
    where pages.id = page_versions.page_id
      and pages.owner_id = (select auth.uid())
  )
);

revoke all on table public.pages from anon, authenticated;
revoke all on table public.page_versions from anon, authenticated;

grant select on table public.pages to authenticated;
grant select on table public.page_versions to authenticated;

create or replace function public.get_published_page(page_slug text)
returns table (
  slug text,
  title text,
  description text,
  sanitized_html text,
  artifact_sha256 text,
  version_id uuid,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    page.slug,
    page.title,
    page.description,
    version.sanitized_html,
    encode(
      extensions.digest(convert_to(version.sanitized_html, 'UTF8'), 'sha256'),
      'hex'
    ) as artifact_sha256,
    version.id as version_id,
    page.published_at,
    page.updated_at
  from public.pages as page
  inner join public.page_versions as version
    on version.page_id = page.id
   and version.id = page.published_version_id
  where page.slug = page_slug
    and page.status = 'published'
    and page.deleted_at is null
  limit 1;
$$;

revoke all on function public.get_published_page(text) from public;
grant execute on function public.get_published_page(text) to anon, authenticated;

-- Original HTML is intentionally private. A browser may upload only below its
-- own UUID prefix; the trusted API records that exact path in page_versions.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'page-originals',
  'page-originals',
  false,
  1048576,
  array['text/html', 'application/xhtml+xml']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists page_originals_owner_read on storage.objects;
create policy page_originals_owner_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'page-originals'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists page_originals_owner_upload on storage.objects;
create policy page_originals_owner_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'page-originals'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists page_originals_owner_delete on storage.objects;
create policy page_originals_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'page-originals'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

comment on table public.pages is
  'Stable page identity and publication pointer. Rows are soft-deleted so slugs remain reserved.';
comment on table public.page_versions is
  'Immutable source metadata plus its server-sanitized artifact. Original files are private Storage objects.';
comment on function public.get_published_page(text) is
  'Returns only the public-safe artifact and metadata for one currently published slug.';

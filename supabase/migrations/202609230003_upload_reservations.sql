-- Require a short-lived server reservation before an authenticated user may
-- upload a source object. This prevents clients from bypassing the API and
-- filling the private bucket with orphan objects.

create table public.upload_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '10 minutes',
  consumed_at timestamptz,
  constraint upload_reservations_path_length check (
    char_length(object_path) between 39 and 1024
  ),
  constraint upload_reservations_path_safe check (
    object_path !~ '(^/|//|(^|/)\.\.?(/|$))'
  ),
  constraint upload_reservations_expiry check (expires_at > created_at),
  constraint upload_reservations_consumed_after_creation check (
    consumed_at is null or consumed_at >= created_at
  )
);

create index upload_reservations_owner_created_idx
  on public.upload_reservations (owner_id, created_at desc);

create index upload_reservations_expiry_idx
  on public.upload_reservations (expires_at)
  where consumed_at is null;

alter table public.upload_reservations enable row level security;
revoke all on table public.upload_reservations from anon, authenticated;

grant select, insert, update, delete
on table public.upload_reservations
to tagworks_ingest;

create policy upload_reservations_ingest_all
on public.upload_reservations
for all
to tagworks_ingest
using (true)
with check (true);

create or replace function public.can_upload_page_original(object_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.upload_reservations as reservation
    where reservation.object_path = object_name
      and reservation.owner_id = auth.uid()
      and reservation.consumed_at is null
      and reservation.expires_at > timezone('utc', now())
      and split_part(reservation.object_path, '/', 1) = auth.uid()::text
  );
$$;

revoke all on function public.can_upload_page_original(text) from public, anon;
grant execute on function public.can_upload_page_original(text) to authenticated;

drop policy if exists page_originals_owner_upload on storage.objects;
create policy page_originals_owner_upload
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'page-originals'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.can_upload_page_original(name)
);

-- The publisher needs no digest or internal version id. Avoid hashing the full
-- artifact on every anonymous request and expose only public-safe fields.
drop function public.get_published_page(text);

create function public.get_published_page(page_slug text)
returns table (
  slug text,
  title text,
  description text,
  sanitized_html text,
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

comment on table public.upload_reservations is
  'Short-lived server-created permits for authenticated private Storage uploads.';

-- Images for every plan, stored per version.
--
-- Images live at page-images/{owner-id}/{page-id}/{version-id}/{file}. Each
-- edit uploads a complete new set under a new version path, the page switches
-- to it, and the previous version's files are deleted afterwards. A changed
-- path means visitors never see a stale cached image after an edit.

-- HTML originals may now be up to 2 MiB.
update storage.buckets
set file_size_limit = 2097152
where id = 'page-originals';

-- 4 MiB is the largest per-image limit of any plan (checked again per plan
-- by the server). GIF is allowed so animations survive.
update storage.buckets
set file_size_limit = 4194304,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'page-images';

-- Images are available on every plan, so the paid-only check goes away.
-- Uploads are limited to the owner's own folder; the publish step verifies
-- count and size against the plan and removes anything it does not use.
drop policy if exists page_images_owner_upload on storage.objects;
create policy page_images_owner_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'page-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Reads and deletes cover the new layout and the earlier
-- {username}/{owner-id}/... layout.
drop policy if exists page_images_owner_read on storage.objects;
create policy page_images_owner_read on storage.objects
for select to authenticated using (
  bucket_id = 'page-images'
  and (select auth.uid())::text in ((storage.foldername(name))[1], (storage.foldername(name))[2])
);

drop policy if exists page_images_owner_delete on storage.objects;
create policy page_images_owner_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'page-images'
  and (select auth.uid())::text in ((storage.foldername(name))[1], (storage.foldername(name))[2])
);

drop function if exists public.can_upload_page_images();

-- Version assets ------------------------------------------------------------

alter table public.page_versions
  add column image_paths text[] not null default '{}',
  add column image_count integer not null default 0,
  add column total_bytes integer,
  add constraint page_versions_image_count check (
    image_count between 0 and 1000 and image_count = coalesce(array_length(image_paths, 1), 0)
  ),
  add constraint page_versions_total_bytes check (total_bytes is null or total_bytes > 0);

grant select (id, page_id, source_object_path, source_storage, image_paths, image_count, total_bytes)
  on public.page_versions to tagworks_ingest;
grant insert (image_paths, image_count, total_bytes)
  on public.page_versions to tagworks_ingest;

-- Storage deletes that failed after an edit are retried later.
create table public.storage_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  path text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint storage_cleanup_queue_bucket check (bucket in ('page-images', 'page-originals')),
  constraint storage_cleanup_queue_path_safe check (
    char_length(path) between 1 and 1024 and path !~ '(^/|//|(^|/)\.\.?(/|$))'
  ),
  constraint storage_cleanup_queue_path_owner check (
    split_part(path, '/', 1) = owner_id::text or split_part(path, '/', 2) = owner_id::text
  ),
  constraint storage_cleanup_queue_unique unique (bucket, path)
);

create index storage_cleanup_queue_owner_idx on public.storage_cleanup_queue (owner_id, created_at);

alter table public.storage_cleanup_queue enable row level security;
revoke all on table public.storage_cleanup_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.storage_cleanup_queue to tagworks_ingest;
create policy storage_cleanup_queue_ingest_all on public.storage_cleanup_queue
for all to tagworks_ingest using (true) with check (true);

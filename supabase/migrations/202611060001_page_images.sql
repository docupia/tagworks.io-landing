insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('page-images', 'page-images', true, 3145728, array['image/png', 'image/jpeg', 'image/webp']);

create policy page_images_owner_read on storage.objects
for select to authenticated using (
  bucket_id = 'page-images' and (storage.foldername(name))[2] = (select auth.uid())::text
);

create policy page_images_owner_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'page-images' and (storage.foldername(name))[2] = (select auth.uid())::text
);

create policy page_images_owner_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'page-images' and (storage.foldername(name))[2] = (select auth.uid())::text
);

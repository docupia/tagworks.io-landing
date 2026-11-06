create function public.can_upload_page_images()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.billing_accounts
    where owner_id = (select auth.uid())
      and paid_customer
  );
$$;

revoke all on function public.can_upload_page_images() from public;
grant execute on function public.can_upload_page_images() to authenticated;

alter policy page_images_owner_upload on storage.objects
with check (
  bucket_id = 'page-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select public.can_upload_page_images())
);

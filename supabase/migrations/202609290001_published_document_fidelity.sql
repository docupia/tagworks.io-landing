-- Expose the sanitizer contract with each public artifact so the publisher can
-- distinguish canonical full documents from legacy HTML fragments.

drop function public.get_published_page(text);

create function public.get_published_page(page_slug text)
returns table (
  slug text,
  title text,
  description text,
  sanitized_html text,
  sanitizer_version text,
  version_id uuid,
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
    version.sanitizer_version,
    version.id as version_id,
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

comment on function public.get_published_page(text) is
  'Returns the current public artifact and its sanitizer rendering contract.';

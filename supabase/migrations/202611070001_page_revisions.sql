alter table public.pages
  add column revision_count integer not null default 0
  check (revision_count between 0 and 3);

grant select (status, deleted_at, revision_count),
      update (revision_count)
on public.pages to tagworks_ingest;

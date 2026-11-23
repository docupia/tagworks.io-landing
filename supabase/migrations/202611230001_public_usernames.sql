-- Aliases never become available again, including after account deletion.
create table public.public_username_aliases (
  username text primary key check (username ~ '^[a-z][a-z0-9-]{2,29}$'),
  owner_id uuid not null,
  created_at timestamptz not null default now(),
  unique(owner_id,username)
);
create table public.public_profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  foreign key(owner_id,username) references public.public_username_aliases(owner_id,username)
);
alter table public.public_username_aliases enable row level security;
alter table public.public_profiles enable row level security;
revoke all on public.public_username_aliases,public.public_profiles from public,anon,authenticated;
grant select on public.public_profiles to tagworks_ingest;
create policy public_profiles_ingest on public.public_profiles for select to tagworks_ingest using(true);

create function public.set_public_username(member uuid, requested text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if requested !~ '^[a-z][a-z0-9-]{2,29}$' then
    raise exception 'Invalid public username' using errcode='22023';
  end if;
  if not exists(select 1 from auth.users where id=member) then
    raise exception 'Unknown account' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(member::text,23));
  insert into public.public_username_aliases(username,owner_id) values(requested,member)
    on conflict(username) do nothing;
  if not exists(select 1 from public.public_username_aliases where username=requested and owner_id=member) then
    raise exception 'Username unavailable' using errcode='23505';
  end if;
  insert into public.public_profiles(owner_id,username) values(member,requested)
    on conflict(owner_id) do update set username=excluded.username;
end;
$$;
revoke all on function public.set_public_username(uuid,text) from public;
grant execute on function public.set_public_username(uuid,text) to tagworks_ingest;

create function public.public_username_owns_page(public_name text,page_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.public_username_aliases a
    join public.pages p on p.owner_id=a.owner_id
    where a.username=public_name and p.slug=page_slug
      and p.status='published' and p.deleted_at is null
  );
$$;
revoke all on function public.public_username_owns_page(text,text) from public;
grant execute on function public.public_username_owns_page(text,text) to anon,authenticated;

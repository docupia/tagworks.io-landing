-- Keys are stored as SHA-256 hashes; only their owner can manage them.
create table public.personal_api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  key_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index personal_api_keys_owner_idx on public.personal_api_keys(owner_id);
alter table public.personal_api_keys enable row level security;
revoke all on public.personal_api_keys from public, anon, authenticated, tagworks_ingest;
grant select (id, owner_id, name, key_prefix, created_at, last_used_at, revoked_at)
on public.personal_api_keys to authenticated;
create policy personal_api_keys_owner_read on public.personal_api_keys for select
to authenticated using (owner_id = (select auth.uid()));

create function public.create_personal_api_key(key_name text, token_hash text, token_prefix text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 81));
  if (select count(*) from public.personal_api_keys where owner_id = auth.uid() and revoked_at is null) >= 10 then
    raise exception 'Maximum 10 active API keys';
  end if;
  if token_prefix !~ '^tw_live_[0-9a-f]{8}$' then raise exception 'Invalid key prefix'; end if;
  insert into public.personal_api_keys(owner_id, name, key_hash, key_prefix)
  values (auth.uid(), key_name, token_hash, token_prefix) returning id into new_id;
  return new_id;
end;
$$;
create function public.revoke_personal_api_key(key_id uuid)
returns boolean language sql security definer set search_path = pg_catalog, public as $$
  with revoked as (
    update public.personal_api_keys set revoked_at = now()
    where id = key_id and owner_id = auth.uid() and revoked_at is null returning id
  ) select exists(select 1 from revoked);
$$;
revoke all on function public.create_personal_api_key(text,text,text) from public, anon;
revoke all on function public.revoke_personal_api_key(uuid) from public, anon;
grant execute on function public.create_personal_api_key(text,text,text) to authenticated;
grant execute on function public.revoke_personal_api_key(uuid) to authenticated;

-- Rate limit across all keys belonging to an owner, including concurrent calls.
create table public.api_request_windows (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null
);
alter table public.api_request_windows enable row level security;
revoke all on public.api_request_windows from public, anon, authenticated, tagworks_ingest;
create function public.authenticate_personal_api_key(token_hash text)
returns table(owner_id uuid, rate_limited boolean)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare target_owner uuid; request_count integer;
begin
  select k.owner_id into target_owner from public.personal_api_keys k
  join auth.users u on u.id = k.owner_id
  where k.key_hash = token_hash and k.revoked_at is null
    and u.deleted_at is null and (u.banned_until is null or u.banned_until < now());
  if target_owner is null then return; end if;
  insert into public.api_request_windows as w(owner_id, window_start, requests)
  values(target_owner, date_trunc('minute', now()), 1)
  on conflict on constraint api_request_windows_pkey do update
  set requests = case when w.window_start = excluded.window_start then least(w.requests + 1, 121) else 1 end,
      window_start = excluded.window_start
  returning requests into request_count;
  update public.personal_api_keys set last_used_at = now() where key_hash = token_hash;
  return query select target_owner, request_count > 120;
end;
$$;
revoke all on function public.authenticate_personal_api_key(text) from public, anon, authenticated;
grant execute on function public.authenticate_personal_api_key(text) to tagworks_ingest;

-- API originals live in immutable, owner-private version rows instead of Storage.
alter table public.page_versions
  add column source_storage text not null default 'storage'
    check (source_storage in ('storage', 'database')),
  add column original_html text,
  add constraint page_versions_database_original check (
    (source_storage = 'storage' and original_html is null)
    or (source_storage = 'database' and original_html is not null
      and octet_length(original_html) = source_bytes)
  );
grant insert (source_storage, original_html) on public.page_versions to tagworks_ingest;

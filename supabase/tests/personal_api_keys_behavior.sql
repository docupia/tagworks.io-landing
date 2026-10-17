begin;
insert into auth.users(id, email, aud, role)
values ('81000000-0000-4000-8000-000000000001', 'api-key-test@example.invalid', 'authenticated', 'authenticated'),
       ('81000000-0000-4000-8000-000000000002', 'api-key-other@example.invalid', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select public.create_personal_api_key('Test key', repeat('a',64), 'tw_live_12345678');
do $$ begin
  if has_column_privilege('authenticated','public.personal_api_keys','key_hash','SELECT') then raise exception 'Key hashes must be private'; end if;
end $$;
reset role;
do $$ declare identity record; i integer; begin
  if not has_function_privilege('tagworks_ingest','public.authenticate_personal_api_key(text)','EXECUTE')
    or has_function_privilege('authenticated','public.authenticate_personal_api_key(text)','EXECUTE') then
    raise exception 'Incorrect API authentication function grants';
  end if;
  select * into identity from public.authenticate_personal_api_key(repeat('a',64));
  if identity.owner_id <> '81000000-0000-4000-8000-000000000001'::uuid or identity.rate_limited then raise exception 'Authentication failed'; end if;
  if exists(select 1 from public.authenticate_personal_api_key(repeat('b',64))) then raise exception 'Invalid key accepted'; end if;
  for i in 2..120 loop
    select * into identity from public.authenticate_personal_api_key(repeat('a',64));
    if identity.rate_limited then raise exception 'Rate limit applied too early'; end if;
  end loop;
  select * into identity from public.authenticate_personal_api_key(repeat('a',64));
  if not identity.rate_limited then raise exception 'Rate limit not enforced'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
do $$ begin
  if exists(select 1 from public.personal_api_keys) then raise exception 'Cross-owner key read'; end if;
end $$;
reset role;
do $$ declare key_id uuid; begin
  select id into key_id from public.personal_api_keys where key_hash=repeat('a',64);
  perform set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
  if public.revoke_personal_api_key(key_id) then raise exception 'Cross-owner revocation'; end if;
  perform set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
  if not public.revoke_personal_api_key(key_id) then raise exception 'Owner revocation failed'; end if;
  if exists(select 1 from public.authenticate_personal_api_key(repeat('a',64))) then raise exception 'Revoked key accepted'; end if;
end $$;
rollback;

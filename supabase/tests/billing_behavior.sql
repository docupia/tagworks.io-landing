-- Transactional billing and upload-quota behavior checks.

begin;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  '71000000-0000-4000-8000-000000000001'::uuid,
  'authenticated',
  'authenticated',
  'tagworks-billing-test@example.invalid',
  extensions.crypt('billing-test-only', extensions.gen_salt('bf')),
  now(), '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now()
);

do $$
declare
  quota record;
  entitlement record;
begin
  select * into entitlement
  from public.get_upload_entitlement('71000000-0000-4000-8000-000000000001'::uuid);
  if entitlement.tier <> 'free' or entitlement.total_remaining <> 1 then
    raise exception 'new account must receive exactly one free upload';
  end if;

  select * into quota from public.reserve_upload_quota(
    '71000000-0000-4000-8000-000000000001'::uuid,
    '72000000-0000-4000-8000-000000000001'::uuid,
    '71000000-0000-4000-8000-000000000001/page/version/free.html'
  );
  if not quota.allowed or quota.quota_source <> 'free' then
    raise exception 'first free upload must be reserved';
  end if;

  if not public.consume_upload_quota(
    '71000000-0000-4000-8000-000000000001'::uuid,
    '72000000-0000-4000-8000-000000000001'::uuid
  ) then
    raise exception 'free reservation must be consumable';
  end if;

  select * into quota from public.reserve_upload_quota(
    '71000000-0000-4000-8000-000000000001'::uuid,
    '72000000-0000-4000-8000-000000000002'::uuid,
    '71000000-0000-4000-8000-000000000001/page/version/denied.html'
  );
  if quota.allowed then
    raise exception 'second free upload must be denied';
  end if;

  perform public.grant_paypal_prepaid_pack(
    '71000000-0000-4000-8000-000000000001'::uuid,
    'ORDER-BILLING-TEST',
    'CAPTURE-BILLING-TEST',
    'PAYER-BILLING-TEST',
    100.00,
    'USD',
    now()
  );

  select * into entitlement
  from public.get_upload_entitlement('71000000-0000-4000-8000-000000000001'::uuid);
  if entitlement.tier <> 'prepaid' or entitlement.prepaid_remaining <> 300 then
    raise exception 'completed prepaid payment must grant 300 uploads';
  end if;

  select * into quota from public.reserve_upload_quota(
    '71000000-0000-4000-8000-000000000001'::uuid,
    '72000000-0000-4000-8000-000000000003'::uuid,
    '71000000-0000-4000-8000-000000000001/page/version/prepaid.html'
  );
  if not quota.allowed or quota.quota_source <> 'prepaid' then
    raise exception 'prepaid upload must be reserved from credit balance';
  end if;

  if not public.release_upload_quota(
    '71000000-0000-4000-8000-000000000001'::uuid,
    '72000000-0000-4000-8000-000000000003'::uuid
  ) then
    raise exception 'failed upload must release its prepaid reservation';
  end if;

  select * into entitlement
  from public.get_upload_entitlement('71000000-0000-4000-8000-000000000001'::uuid);
  if entitlement.prepaid_remaining <> 300 then
    raise exception 'released prepaid reservation must restore one upload';
  end if;

  perform public.sync_paypal_subscription(
    '71000000-0000-4000-8000-000000000001'::uuid,
    'I-BILLING-TEST',
    'P-BILLING-TEST',
    'PAYER-BILLING-TEST',
    'ACTIVE',
    now(),
    now() + interval '1 month',
    now()
  );

  select * into entitlement
  from public.get_upload_entitlement('71000000-0000-4000-8000-000000000001'::uuid);
  if entitlement.tier <> 'monthly' or entitlement.monthly_remaining <> 50 then
    raise exception 'active subscription must grant a fresh 50-upload period';
  end if;

  select * into quota from public.reserve_upload_quota(
    '71000000-0000-4000-8000-000000000001'::uuid,
    '72000000-0000-4000-8000-000000000004'::uuid,
    '71000000-0000-4000-8000-000000000001/page/version/monthly.html'
  );
  if not quota.allowed or quota.quota_source <> 'monthly' then
    raise exception 'active monthly allowance must be consumed before prepaid credits';
  end if;

  update public.billing_accounts
  set is_super_admin = true,
      monthly_uploads_used = 50,
      prepaid_uploads_remaining = 0
  where owner_id = '71000000-0000-4000-8000-000000000001'::uuid;

  select * into entitlement
  from public.get_upload_entitlement('71000000-0000-4000-8000-000000000001'::uuid);
  if entitlement.tier <> 'admin' or not entitlement.can_upload then
    raise exception 'super administrator must have unlimited upload access';
  end if;

  select * into quota from public.reserve_upload_quota(
    '71000000-0000-4000-8000-000000000001'::uuid,
    '72000000-0000-4000-8000-000000000005'::uuid,
    '71000000-0000-4000-8000-000000000001/page/version/admin.html'
  );
  if not quota.allowed or quota.quota_source <> 'admin' then
    raise exception 'super administrator upload must be reserved without a paid balance';
  end if;

  select * into entitlement
  from public.get_upload_entitlement('71000000-0000-4000-8000-000000000001'::uuid);
  if entitlement.tier <> 'admin' or entitlement.total_remaining <> 2147483647 then
    raise exception 'super administrator allowance must remain unlimited after a reservation';
  end if;
end;
$$;

rollback;

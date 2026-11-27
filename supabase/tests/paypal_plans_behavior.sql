-- PayPal subscription to plan behavior. Runs in a transaction and rolls back.

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '75000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'tagworks-paypal-plan@example.invalid',
  extensions.crypt('paypal-plan-only', extensions.gen_salt('bf')), now(), '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now());

do $$
declare
  owner uuid := '75000000-0000-4000-8000-000000000001';
  account record;
  t0 timestamptz := now() - interval '1 day';
begin
  -- New Starter subscription.
  assert public.sync_paypal_plan(owner, 'I-SUB', 'P-STARTER-M', 'starter', 'month', 'PAYER', 'ACTIVE',
    t0, t0 + interval '1 month', now() - interval '10 minutes');
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'starter', 'starter applies';

  -- Same webhook again: same result.
  assert public.sync_paypal_plan(owner, 'I-SUB', 'P-STARTER-M', 'starter', 'month', 'PAYER', 'ACTIVE',
    t0, t0 + interval '1 month', now() - interval '10 minutes');
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'starter' and account.pending_plan is null, 'duplicate event is idempotent';

  -- Upgrade applies at once.
  perform public.sync_paypal_plan(owner, 'I-SUB', 'P-PRO-M', 'pro', 'month', 'PAYER', 'ACTIVE',
    t0, t0 + interval '1 month', now() - interval '9 minutes');
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'pro', 'upgrade is immediate';

  -- Downgrade waits for the end of the paid period.
  perform public.sync_paypal_plan(owner, 'I-SUB', 'P-STARTER-M', 'starter', 'month', 'PAYER', 'ACTIVE',
    t0, t0 + interval '1 month', now() - interval '8 minutes');
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'pro' and account.pending_plan = 'starter', 'downgrade is scheduled';

  -- Next period starts: the scheduled plan applies.
  perform public.sync_paypal_plan(owner, 'I-SUB', 'P-STARTER-M', 'starter', 'month', 'PAYER', 'ACTIVE',
    t0 + interval '1 month', t0 + interval '2 months', now() - interval '7 minutes');
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'starter' and account.pending_plan is null, 'downgrade applied in the next period';

  -- An older event cannot roll the state back.
  assert not public.sync_paypal_plan(owner, 'I-SUB', 'P-PRO-M', 'pro', 'month', 'PAYER', 'ACTIVE',
    t0, t0 + interval '1 month', now() - interval '1 hour'), 'stale event ignored';

  -- Payment failure: seven days of grace.
  assert public.mark_paypal_payment_failed('I-SUB');
  select * into account from public.get_account_plan(owner);
  assert account.grace_until > now() + interval '6 days', 'grace period set';
  perform public.sync_paypal_plan(owner, 'I-SUB', 'P-STARTER-M', 'starter', 'month', 'PAYER', 'SUSPENDED',
    null, null, now() - interval '6 minutes');
  update public.billing_accounts set subscription_period_start = now() - interval '32 days', subscription_period_end = now() - interval '1 day' where owner_id = owner;
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'starter', 'grace keeps the plan after a failed renewal';
  update public.billing_accounts set grace_until = now() - interval '1 minute' where owner_id = owner;
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'free', 'after grace the account is on Free';

  -- Resubscribing yearly to Pro.
  perform public.sync_paypal_plan(owner, 'I-SUB-2', 'P-PRO-Y', 'pro', 'year', 'PAYER', 'ACTIVE',
    now(), now() + interval '1 year', now());
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'pro' and account.grace_until is null, 'yearly Pro applies';
  assert (select billing_interval from public.billing_accounts where owner_id = owner) = 'year';

  -- A different subscription cannot take over an active one.
  assert not public.sync_paypal_plan(owner, 'I-OTHER', 'P-STARTER-M', 'starter', 'month', 'PAYER', 'ACTIVE',
    now(), now() + interval '1 month', now() + interval '1 minute');

  -- Custom accounts are left alone by PayPal events.
  update public.billing_accounts set plan = 'custom' where owner_id = owner;
  perform public.sync_paypal_plan(owner, 'I-SUB-2', 'P-STARTER-M', 'starter', 'month', 'PAYER', 'ACTIVE',
    now(), now() + interval '1 month', now() + interval '2 minutes');
  select * into account from public.get_account_plan(owner);
  assert account.effective_plan = 'custom', 'custom is not overwritten';
end;
$$;

rollback;

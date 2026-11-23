-- PAYRAIL54 v2 — atomic authorization state machine (Postgres / Supabase)
--
-- One DB transaction per call covers: idempotency claim, ownership/mandate version check,
-- budget lock, intent + approval consumption, reservation, state, and FA54 outbox receipt.
-- It does NOT span the issuer/payment network. External effects go through outboxes and
-- are reconciled idempotently (see p54_stale_reservations).
--
-- States:  RECEIVED → DECLINED                                   (terminal)
--          RECEIVED → RESERVED → ISSUER_APPROVED → CAPTURED → SETTLED
--                     RESERVED → REVERSED   (issuer declined / timed out / reversal)
--                     ISSUER_APPROVED → REVERSED
-- Refunds and disputes are events on CAPTURED/SETTLED, not states.

create table if not exists p54_capabilities (
  ref                  text primary key,
  holofoil_card_id     text not null,
  mandate_id           text not null,
  mandate_expires_at   timestamptz not null,
  owner_id             text not null,
  owner_version        bigint not null default 0,   -- bumped by every ownership event
  status               text not null check (status in ('inactive','active','suspended','revoked')),
  currency             text not null default 'USD',
  per_txn_limit_cents  bigint not null check (per_txn_limit_cents > 0),
  daily_limit_cents    bigint not null check (daily_limit_cents > 0),
  approval_above_cents bigint not null check (approval_above_cents >= 0),
  updated_at           timestamptz not null default now()
);

-- CIP-54 purchase intents. Signature verified by the handler before insert;
-- the signed payload is stored so FA54 can re-verify later.
create table if not exists p54_intents (
  id            text primary key,
  cap_ref       text not null references p54_capabilities(ref),
  mandate_id    text not null,
  nonce         text not null unique,
  merchant_id   text not null,
  currency      text not null,
  max_cents     bigint not null check (max_cents > 0),
  expires_at    timestamptz not null,
  signed_payload jsonb not null,
  consumed_at   timestamptz,
  consumed_by_auth text
);

-- Human approvals, bound to ONE intent + mandate + merchant + currency + amount ceiling.
-- (The issuer auth id does not exist until purchase time, so binding is to the single-use intent.)
create table if not exists p54_approvals (
  id            text primary key,
  intent_id     text not null references p54_intents(id),
  cap_ref       text not null,
  mandate_id    text not null,
  merchant_id   text not null,
  currency      text not null,
  max_cents     bigint not null check (max_cents > 0),
  approver_id   text not null,
  expires_at    timestamptz not null,
  signed_payload jsonb not null,
  consumed_at   timestamptz,
  consumed_by_auth text
);

create table if not exists p54_authorizations (
  auth_id        text primary key,           -- issuer authorization id = idempotency key
  cap_ref        text,
  intent_id      text,
  approval_id    text,
  amount_cents   bigint not null,
  currency       text not null,
  merchant_id    text,
  state          text not null check (state in
                   ('RECEIVED','DECLINED','RESERVED','ISSUER_APPROVED','REVERSED','CAPTURED','SETTLED')),
  reason         text not null,
  held_cents     bigint not null default 0,
  captured_cents bigint not null default 0,
  refunded_cents bigint not null default 0,
  receipt_id     bigint,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists p54_auth_cap_day on p54_authorizations (cap_ref, created_at);
create index if not exists p54_auth_state on p54_authorizations (state, updated_at);

create table if not exists p54_issuer_events (
  event_id     text primary key,             -- issuer event id = idempotency key
  auth_id      text not null references p54_authorizations(auth_id),
  type         text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  created_at   timestamptz not null default now()
);

-- FA54 outbox: worker ships to the Receipt Ledger, marks shipped_at, retries until acked.
create table if not exists p54_receipt_outbox (
  id bigserial primary key, kind text not null, payload jsonb not null,
  created_at timestamptz not null default now(), shipped_at timestamptz
);

-- Issuer outbox: suspend card / sync hard limits. Worker calls issuer idempotently.
create table if not exists p54_issuer_commands (
  id bigserial primary key, cap_ref text not null,
  command text not null check (command in ('suspend','sync_limits')),
  created_at timestamptz not null default now(), done_at timestamptz
);

-- ---------------------------------------------------------------------------
create or replace function p54__receipt(p_kind text, p_payload jsonb) returns bigint
language sql as $$
  insert into p54_receipt_outbox (kind, payload) values (p_kind, p_payload || jsonb_build_object('at', now()))
  returning id
$$;

create or replace function p54__replay(p_auth_id text)
returns table (approved boolean, reason text, receipt_id bigint) language sql as $$
  select a.state in ('RESERVED','ISSUER_APPROVED','CAPTURED','SETTLED'), a.reason, a.receipt_id
  from p54_authorizations a where a.auth_id = p_auth_id
$$;

-- ---------------------------------------------------------------------------
-- Durable decline for requests rejected by handler pre-checks. Idempotent per auth_id.
create or replace function p54_record_decline(
  p_auth_id text, p_cap_ref text, p_amount bigint, p_currency text,
  p_merchant_id text, p_reason text
) returns table (approved boolean, reason text, receipt_id bigint)
language plpgsql as $$
declare v_receipt bigint;
begin
  insert into p54_authorizations (auth_id, cap_ref, amount_cents, currency, merchant_id, state, reason)
  values (p_auth_id, p_cap_ref, p_amount, p_currency, p_merchant_id, 'DECLINED', p_reason)
  on conflict (auth_id) do nothing;
  if not found then return query select * from p54__replay(p_auth_id); return; end if;

  v_receipt := p54__receipt('authorization', jsonb_build_object('state','DECLINED','reason',p_reason,
    'auth_id',p_auth_id,'cap_ref',p_cap_ref,'amount_cents',p_amount,'currency',p_currency,
    'merchant_id',p_merchant_id));
  update p54_authorizations set receipt_id = v_receipt where auth_id = p_auth_id;
  return query select false, p_reason, v_receipt;
end $$;

-- ---------------------------------------------------------------------------
-- Final atomic decision. p_owner_version / p_mandate_id are what the handler validated;
-- if either changed before this commit, the purchase is declined.
create or replace function p54_authorize(
  p_auth_id text, p_cap_ref text, p_intent_id text, p_approval_id text,
  p_amount bigint, p_currency text, p_merchant_id text,
  p_mandate_id text, p_owner_version bigint
) returns table (approved boolean, reason text, receipt_id bigint)
language plpgsql as $$
declare
  c p54_capabilities%rowtype; i p54_intents%rowtype; ap p54_approvals%rowtype;
  v_spent bigint; v_reason text := null; v_receipt bigint; v_use_approval boolean := false;
begin
  -- 1. Claim auth_id. Concurrent duplicates block on the PK, then replay the committed decision.
  insert into p54_authorizations (auth_id, cap_ref, intent_id, amount_cents, currency, merchant_id, state, reason)
  values (p_auth_id, p_cap_ref, p_intent_id, p_amount, p_currency, p_merchant_id, 'RECEIVED', 'pending')
  on conflict (auth_id) do nothing;
  if not found then return query select * from p54__replay(p_auth_id); return; end if;

  -- 2. Lock the capability: serializes spend AND ownership changes for this card.
  select * into c from p54_capabilities where ref = p_cap_ref for update;
  if not found then v_reason := 'unknown_card';
  elsif c.status <> 'active' then v_reason := 'capability_inactive';
  elsif c.mandate_id <> p_mandate_id or c.mandate_expires_at <= now() then v_reason := 'mandate_invalid';
  elsif c.owner_version <> p_owner_version then v_reason := 'ownership_changed';
  elsif p_amount <= 0 then v_reason := 'invalid_amount';
  elsif p_currency <> c.currency then v_reason := 'currency_not_allowed';
  elsif p_amount > c.per_txn_limit_cents then v_reason := 'per_txn_limit';
  end if;

  -- 3. Daily limit (UTC day). Holds + captures count; refunds do not restore headroom.
  if v_reason is null then
    select coalesce(sum(held_cents + captured_cents), 0) into v_spent from p54_authorizations
    where cap_ref = p_cap_ref
      and state in ('RESERVED','ISSUER_APPROVED','CAPTURED','SETTLED')
      and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
    if v_spent + p_amount > c.daily_limit_cents then v_reason := 'daily_limit'; end if;
  end if;

  -- 4. Intent: this card + mandate, unconsumed, unexpired, exact merchant/currency, within ceiling.
  if v_reason is null then
    select * into i from p54_intents where id = p_intent_id for update;
    if not found or i.cap_ref <> p_cap_ref or i.mandate_id <> c.mandate_id then v_reason := 'no_matching_intent';
    elsif i.consumed_at is not null then v_reason := 'intent_already_used';
    elsif i.expires_at <= now() then v_reason := 'intent_expired';
    elsif i.merchant_id <> p_merchant_id or i.currency <> p_currency or p_amount > i.max_cents
      then v_reason := 'no_matching_intent';
    end if;
  end if;

  -- 5. Human approval above threshold, bound to this exact intent/mandate/merchant/amount.
  if v_reason is null and p_amount > c.approval_above_cents then
    if p_approval_id is null then v_reason := 'approval_required';
    else
      select * into ap from p54_approvals where id = p_approval_id for update;
      if not found or ap.intent_id <> p_intent_id or ap.cap_ref <> p_cap_ref
         or ap.mandate_id <> c.mandate_id or ap.merchant_id <> p_merchant_id
         or ap.currency <> p_currency or p_amount > ap.max_cents then v_reason := 'approval_mismatch';
      elsif ap.consumed_at is not null then v_reason := 'approval_already_used';
      elsif ap.expires_at <= now() then v_reason := 'approval_expired';
      else v_use_approval := true;
      end if;
    end if;
  end if;

  -- 6. Commit decision + evidence together.
  if v_reason is null then
    update p54_intents set consumed_at = now(), consumed_by_auth = p_auth_id where id = p_intent_id;
    if v_use_approval then
      update p54_approvals set consumed_at = now(), consumed_by_auth = p_auth_id where id = p_approval_id;
    end if;
    update p54_authorizations
       set state = 'RESERVED', reason = 'ok', held_cents = p_amount,
           approval_id = case when v_use_approval then p_approval_id end, updated_at = now()
     where auth_id = p_auth_id;
  else
    update p54_authorizations set state = 'DECLINED', reason = v_reason, updated_at = now()
     where auth_id = p_auth_id;
  end if;

  v_receipt := p54__receipt('authorization', jsonb_build_object(
    'state', case when v_reason is null then 'RESERVED' else 'DECLINED' end,
    'reason', coalesce(v_reason,'ok'), 'auth_id', p_auth_id, 'cap_ref', p_cap_ref,
    'intent_id', p_intent_id, 'approval_id', case when v_use_approval then p_approval_id end,
    'amount_cents', p_amount, 'currency', p_currency, 'merchant_id', p_merchant_id,
    'owner_version', p_owner_version));
  update p54_authorizations set receipt_id = v_receipt where auth_id = p_auth_id;
  return query select v_reason is null, coalesce(v_reason,'ok'), v_receipt;
end $$;

-- ---------------------------------------------------------------------------
-- HOLOFOIL ownership event. Versioned: stale/out-of-order events can never restore authority.
-- Revocation is one-way here; re-activation needs a new mandate + new capability.
create or replace function p54_on_card_transfer(p_card_id text, p_owner_version bigint)
returns setof text language plpgsql as $$
declare r text;
begin
  for r in
    update p54_capabilities
       set status = 'revoked', owner_version = p_owner_version, updated_at = now()
     where holofoil_card_id = p_card_id and owner_version < p_owner_version
     returning ref
  loop
    insert into p54_issuer_commands (cap_ref, command) values (r, 'suspend');
    perform p54__receipt('capability_revoked', jsonb_build_object('cap_ref', r,
      'reason','card_transfer','card_id',p_card_id,'owner_version',p_owner_version));
    return next r;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Issuer events drive state transitions. Idempotent on event_id; illegal transitions raise.
create or replace function p54_apply_issuer_event(
  p_event_id text, p_auth_id text, p_type text, p_amount bigint
) returns text language plpgsql as $$
declare a p54_authorizations%rowtype; v_to text;
begin
  select * into a from p54_authorizations where auth_id = p_auth_id for update;
  if not found then raise exception 'p54: event % for unknown auth %', p_event_id, p_auth_id; end if;

  insert into p54_issuer_events (event_id, auth_id, type, amount_cents)
  values (p_event_id, p_auth_id, p_type, p_amount) on conflict (event_id) do nothing;
  if not found then return 'duplicate'; end if;

  v_to := case
    when p_type = 'issuer_approved' and a.state = 'RESERVED'                      then 'ISSUER_APPROVED'
    when p_type in ('issuer_declined','reversal') and a.state in ('RESERVED','ISSUER_APPROVED') then 'REVERSED'
    when p_type = 'capture'  and a.state = 'ISSUER_APPROVED'                      then 'CAPTURED'
    when p_type = 'settled'  and a.state = 'CAPTURED'                             then 'SETTLED'
    when p_type in ('refund','dispute_opened','dispute_closed') and a.state in ('CAPTURED','SETTLED') then a.state
    else null end;
  if v_to is null then
    raise exception 'p54: illegal transition % on % (state %)', p_type, p_auth_id, a.state;
  end if;

  update p54_authorizations set
    state          = v_to,
    held_cents     = case when v_to in ('REVERSED','CAPTURED') then 0 else held_cents end,
    captured_cents = captured_cents + case when p_type = 'capture' then p_amount else 0 end,
    refunded_cents = refunded_cents + case when p_type = 'refund'  then p_amount else 0 end,
    updated_at     = now()
  where auth_id = p_auth_id;

  perform p54__receipt('issuer_event', jsonb_build_object('event_id',p_event_id,'auth_id',p_auth_id,
    'type',p_type,'amount_cents',p_amount,'from',a.state,'to',v_to));
  return v_to;
end $$;

-- ---------------------------------------------------------------------------
-- Reconciliation input: reservations with no issuer outcome yet. A worker QUERIES the issuer
-- for each (never blindly retries) and feeds the result to p54_apply_issuer_event.
create or replace function p54_stale_reservations(p_older_than interval default interval '2 minutes')
returns table (auth_id text, cap_ref text, amount_cents bigint, created_at timestamptz)
language sql as $$
  select auth_id, cap_ref, amount_cents, created_at from p54_authorizations
  where state = 'RESERVED' and updated_at < now() - p_older_than
  order by created_at
$$;

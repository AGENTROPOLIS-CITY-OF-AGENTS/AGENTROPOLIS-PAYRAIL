#!/bin/bash
# PAYRAIL54 v2 SQL tests — concurrency, replay, binding, transfer, state machine.
P="psql -h /tmp/pg -p 5544 -U postgres -v ON_ERROR_STOP=1 -qAt"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1  (expected '$3', got '$2')"; fail=$((fail+1)); fi; }

$P -c "drop schema public cascade; create schema public;" >/dev/null 2>&1
$P -f "$(dirname "$0")/../payrail54_authorize.sql" >/dev/null

$P >/dev/null <<'SQL'
insert into p54_capabilities (ref,holofoil_card_id,mandate_id,mandate_expires_at,owner_id,owner_version,status,per_txn_limit_cents,daily_limit_cents,approval_above_cents)
values ('cap1','card1','m1',now()+interval '30 days','own1',1,'active',5000,20000,5000),
       ('cap2','card2','m2',now()+interval '30 days','own2',1,'active',5000,20000,3000);
insert into p54_intents (id,cap_ref,mandate_id,nonce,merchant_id,currency,max_cents,expires_at,signed_payload)
select 'i'||g,'cap1','m1','n'||g,'mer1','USD',5000,now()+interval '1 hour','{}' from generate_series(1,40) g;
insert into p54_intents (id,cap_ref,mandate_id,nonce,merchant_id,currency,max_cents,expires_at,signed_payload) values
 ('j1','cap2','m2','nj1','mer1','USD',2500,now()+interval '1 hour','{}'),
 ('j2','cap2','m2','nj2','mer1','USD',5000,now()+interval '1 hour','{}'),
 ('j3','cap2','m2','nj3','mer1','USD',5000,now()+interval '1 hour','{}'),
 ('j4','cap2','m2','nj4','mer1','USD',5000,now()-interval '1 minute','{}'),
 ('j5','cap2','m2','nj5','mer1','USD',2000,now()+interval '1 hour','{}'),
 ('j6','cap2','m2','nj6','mer1','USD',2000,now()+interval '1 hour','{}');
insert into p54_approvals values
 ('ap2','j2','cap2','m2','mer1','USD',4500,'human1',now()+interval '1 hour','{}',null,null),
 ('apX','j2','cap2','m2','mer1','USD',4500,'human1',now()+interval '1 hour','{}',null,null);
SQL

# 1. 40 concurrent $50 buys, $200/day → exactly 4 approved
for g in $(seq 1 40); do $P -c "select 1 from p54_authorize('a$g','cap1','i$g',null,5000,'USD','mer1','m1',1)" >/dev/null & done; wait
check "concurrent spend capped at daily limit (4 of 40)" "$($P -c "select count(*) from p54_authorizations where cap_ref='cap1' and state='RESERVED'")" "4"
check "held total never exceeds \$200" "$($P -c "select sum(held_cents) from p54_authorizations where cap_ref='cap1'")" "20000"
check "36 durable daily_limit declines" "$($P -c "select count(*) from p54_authorizations where cap_ref='cap1' and reason='daily_limit'")" "36"
check "every attempt has a receipt" "$($P -c "select count(*) from p54_authorizations a join p54_receipt_outbox r on r.id=a.receipt_id where a.cap_ref='cap1'")" "40"

# 2. 15 concurrent duplicates of one auth id → one row, one receipt, same answer
out=$(for k in $(seq 1 15); do $P -c "select approved from p54_authorize('dup','cap2','j1',null,2000,'USD','mer1','m2',1)" & done; wait)
check "duplicates all get same decision" "$(echo "$out" | sort -u)" "t"
check "duplicates create one row" "$($P -c "select count(*) from p54_authorizations where auth_id='dup'")" "1"
check "duplicates create one receipt" "$($P -c "select count(*) from p54_receipt_outbox where payload->>'auth_id'='dup'")" "1"

# 3. Intent replay / expiry / mismatch
check "intent replay with new auth id" "$($P -c "select reason from p54_authorize('dup-b','cap2','j1',null,2000,'USD','mer1','m2',1)")" "intent_already_used"
check "expired intent" "$($P -c "select reason from p54_authorize('x1','cap2','j4',null,1000,'USD','mer1','m2',1)")" "intent_expired"
check "wrong merchant" "$($P -c "select reason from p54_authorize('x2','cap2','j5',null,1000,'USD','mer9','m2',1)")" "no_matching_intent"
check "amount over intent ceiling" "$($P -c "select reason from p54_authorize('x3','cap2','j5',null,2100,'USD','mer1','m2',1)")" "no_matching_intent"
check "another card's intent" "$($P -c "select reason from p54_authorize('x4','cap2','i40',null,1000,'USD','mer1','m2',1)")" "no_matching_intent"
check "per-txn limit" "$($P -c "select reason from p54_authorize('x5','cap2','j3',null,5001,'USD','mer1','m2',1)")" "per_txn_limit"
check "zero amount" "$($P -c "select reason from p54_authorize('x6','cap2','j3',null,0,'USD','mer1','m2',1)")" "invalid_amount"

# 4. Approval binding
check "no approval above threshold" "$($P -c "select reason from p54_authorize('h1','cap2','j3',null,4000,'USD','mer1','m2',1)")" "approval_required"
check "approval for a different intent" "$($P -c "select reason from p54_authorize('h2','cap2','j3','ap2',4000,'USD','mer1','m2',1)")" "approval_mismatch"
check "approval amount exceeded" "$($P -c "select reason from p54_authorize('h3','cap2','j2','ap2',4600,'USD','mer1','m2',1)")" "approval_mismatch"
check "valid bound approval" "$($P -c "select reason from p54_authorize('h4','cap2','j2','ap2',4000,'USD','mer1','m2',1)")" "ok"
check "approval reuse" "$($P -c "select reason from p54_authorize('h5','cap2','j3','ap2',4000,'USD','mer1','m2',1)")" "approval_mismatch"

# 5. Ownership / mandate
check "stale owner version" "$($P -c "select reason from p54_authorize('o1','cap2','j6',null,1000,'USD','mer1','m2',0)")" "ownership_changed"
check "wrong mandate" "$($P -c "select reason from p54_authorize('o2','cap2','j6',null,1000,'USD','mer1','mX',1)")" "mandate_invalid"
check "stale transfer event ignored" "$($P -c "select count(*) from p54_on_card_transfer('card2',1)")" "0"
check "fresh transfer revokes" "$($P -c "select * from p54_on_card_transfer('card2',2)")" "cap2"
check "issuer suspend queued" "$($P -c "select command from p54_issuer_commands where cap_ref='cap2'")" "suspend"
check "older event cannot restore" "$($P -c "select count(*) from p54_on_card_transfer('card2',1)")" "0"
check "purchase after transfer" "$($P -c "select reason from p54_authorize('o3','cap2','j6',null,1000,'USD','mer1','m2',2)")" "capability_inactive"

# 6. Transfer racing purchases: after revoke commits, nothing new is approved
$P -c "update p54_capabilities set status='active', owner_version=10 where ref='cap1'; update p54_authorizations set created_at=now()-interval '2 days' where cap_ref='cap1';" >/dev/null
$P -c "insert into p54_intents (id,cap_ref,mandate_id,nonce,merchant_id,currency,max_cents,expires_at,signed_payload) select 'r'||g,'cap1','m1','nr'||g,'mer1','USD',1000,now()+interval '1 hour','{}' from generate_series(1,30) g" >/dev/null
for g in $(seq 1 30); do $P -c "select 1 from p54_authorize('race$g','cap1','r$g',null,500,'USD','mer1','m1',10)" >/dev/null & [ $g = 10 ] && $P -c "select 1 from p54_on_card_transfer('card1',11)" >/dev/null & done; wait
# receipt ids are taken while holding cap1's row lock, so they follow lock (commit) order
rev=$($P -c "select id from p54_receipt_outbox where kind='capability_revoked' and payload->>'cap_ref'='cap1'")
check "no approval committed after revocation" "$($P -c "select count(*) from p54_authorizations where auth_id like 'race%' and state='RESERVED' and receipt_id > $rev")" "0"
check "post-revocation attempts declined as inactive" "$($P -c "select count(*) from p54_authorizations where auth_id like 'race%' and receipt_id > $rev and reason <> 'capability_inactive'")" "0"

# 7. State machine + idempotent issuer events
check "issuer approved" "$($P -c "select p54_apply_issuer_event('e1','h4','issuer_approved',4000)")" "ISSUER_APPROVED"
check "duplicate event ignored" "$($P -c "select p54_apply_issuer_event('e1','h4','issuer_approved',4000)")" "duplicate"
check "capture" "$($P -c "select p54_apply_issuer_event('e2','h4','capture',3800)")" "CAPTURED"
check "hold released on capture" "$($P -c "select held_cents||'/'||captured_cents from p54_authorizations where auth_id='h4'")" "0/3800"
check "illegal reversal after capture rejected" "$($P -c "select p54_apply_issuer_event('e3','h4','reversal',3800)" 2>&1 | grep -c 'illegal transition')" "1"
check "refund on captured" "$($P -c "select p54_apply_issuer_event('e4','h4','refund',1000)")" "CAPTURED"
check "settle" "$($P -c "select p54_apply_issuer_event('e5','h4','settled',0)")" "SETTLED"
check "issuer decline releases hold" "$($P -c "select p54_apply_issuer_event('e6','dup','issuer_declined',0); select held_cents from p54_authorizations where auth_id='dup'" | tail -1)" "0"
check "events on declined auth rejected" "$($P -c "select p54_apply_issuer_event('e7','x1','capture',100)" 2>&1 | grep -c 'illegal transition')" "1"

# 8. Reconciliation + decline idempotency
stale=$($P -c "select auth_id from p54_authorizations where cap_ref='cap1' and state='RESERVED' and auth_id like 'a%' limit 1")
$P -c "update p54_authorizations set updated_at=now()-interval '10 minutes' where auth_id='$stale'" >/dev/null
check "stale reservation surfaced for reconcile" "$($P -c "select count(*) from p54_stale_reservations() where auth_id='$stale'")" "1"
check "pre-check decline recorded" "$($P -c "select reason from p54_record_decline('d1','cap1',100,'USD','mer9','merchant_not_allowed')")" "merchant_not_allowed"
check "decline replay keeps original reason" "$($P -c "select reason from p54_record_decline('d1','cap1',100,'USD','mer9','other')")" "merchant_not_allowed"

echo; echo "$pass passed, $fail failed"; [ $fail = 0 ]

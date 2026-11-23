# PAYRAIL54 v2 SQL Recovery — Independent Verification Report

**Date:** November 22, 2026 (America/Los_Angeles)
**Verifier:** VERITY (independent; did not author the recovered files or the I-3 simulation)
**Subject:** The six Library files DOT-54 reported recovering, as delivered to NEURO Nov 22, 2026, 15:10 PT
**Reference:** PAYRAIL54 v2 Independent Review, Nov 7, 2026 (`~/workspace/builds/payrail54-v2-review/PAYRAIL54-V2-INDEPENDENT-REVIEW-2026-11-07.md`); Phase 1 First Response; SQL Recovery Report Nov 19, 2026
**Scope:** Verify the delivered files against the Nov 7 review. No merge, no deploy, no push, no live database touched.

## Bottom line

**D-3 stays BLOCKED.** The delivered copy is genuine v2 source by every checkable measure (see below), but the delivery is **incomplete**: the base `payrail54_authorize.sql` never arrived, so the SQL pair-identity claim cannot be checked, and the files arrived as Library uploads with no repo/branch/head SHA. What would move D-3: the missing base SQL file, pair identity confirmed, and the source placed with a verifiable head SHA. Note also that the recovered code is the **pre-remediation** v2: the review's P0-1, P0-2, and P0-3 findings were confirmed present in this code (two of them empirically), so even a complete delivery leaves the five P0/P1 remediations open before any production claim.

## Delivery inventory (SHAs verified by the verifier)

Staged copies in `~/workspace/builds/arbitrum-robinhood-mentorship/v2-sql-recovery/`; upload originals in `~/workspace/user/files/` left untouched. Staged SHAs match the upload originals byte for byte.

| File (Library name) | Size | SHA-256 |
| --- | --- | --- |
| `payrail54_authorize(1).sql` → `payrail54_authorize-1.sql` | 15,059 B | `6e48028ab83cf56a4f86ab7a3e491b5635d9d513de244a48b9087e96a7f351fb` |
| `run-1.sh` | 9,102 B | `0a88afea1cf05d2c13e89758879c681b593ea74e97ea6a8bab1ad4ce707ba124` |
| `run-1(1).sh` → `run-1-1.sh` | 9,102 B | `0a88afea1cf05d2c13e89758879c681b593ea74e97ea6a8bab1ad4ce707ba124` |
| `handler.test (1).ts` → `handler.test-1.ts` | 5,032 B | `1bfbd0d5a12be0b35cefcc31010546faca816c67e05650eebd38e13b6523bca5` |
| `payrail54-authorize (1).ts` → `payrail54-authorize-1.ts` | 11,501 B | `1e012fa615365a03fdfa44fe83f588b05f2b309695390306b7b0b2175bea9ca8` |

Seven uploads arrived: the five unique files above, plus one byte-identical duplicate each of the two `.ts` files (confirmed by SHA).

### COUNT GAP — incomplete delivery (flagged, not papered over)

Dot's message listed **six** Library files, including both `payrail54_authorize.sql` and `payrail54_authorize(1).sql`. Only **one** SQL file arrived: the `(1)` copy. The base `payrail54_authorize.sql` is **MISSING** from this delivery. Consequences:

- Dot's claim that "the SQL pair has identical readable contents" **CANNOT be checked** from this delivery. Recorded as **NOT VERIFIED / incomplete delivery**.
- The shell pair identity **IS** checkable and **VERIFIED**: identical SHA-256 (`0a88afea…`) and empty `diff`.
- Both scripts reference the missing base file by name: `run-1.sh` line 8 loads `$(dirname "$0")/../payrail54_authorize.sql`, and `handler.test-1.ts` line 1 imports `../payrail54-authorize.ts`. Neither script can run as delivered without the base files. For the test runs below, the verifier placed byte-identical copies of the delivered `(1)` files at the expected paths and records that substitution explicitly. The runs therefore verify the **(1) copy only**, not the pair-identity claim.

## Verdicts per claim

### 1. Function inventory — VERIFIED

The SQL defines all three functions the Nov 7 review names, with exact names:

| Function | Signature | Present |
| --- | --- | --- |
| `p54_authorize` | `(text, text, text, text, bigint, text, text, text, bigint) returns table (approved boolean, reason text, receipt_id bigint)` | Yes |
| `p54__replay` | `(text) returns table (approved boolean, reason text, receipt_id bigint)` | Yes |
| `p54_apply_issuer_event` | `(text, text, text, bigint) returns text` | Yes |

All functions defined in the file (7 total): `p54__receipt`, `p54__replay`, `p54_record_decline`, `p54_authorize`, `p54_on_card_transfer`, `p54_apply_issuer_event`, `p54_stale_reservations`. All tables (7): `p54_capabilities`, `p54_intents`, `p54_approvals`, `p54_authorizations`, `p54_issuer_events`, `p54_receipt_outbox`, `p54_issuer_commands`. Every `p54_*` identifier referenced in the file resolves to a definition in the file; no undefined function or table references. All 15 SQL decline-reason strings (`unknown_card`, `capability_inactive`, `mandate_invalid`, `ownership_changed`, `invalid_amount`, `currency_not_allowed`, `per_txn_limit`, `daily_limit`, `no_matching_intent`, `intent_already_used`, `intent_expired`, `approval_required`, `approval_mismatch`, `approval_already_used`, `approval_expired`) appear in the handler's `DeclineReason` union.

### 2. Check counts — VERIFIED (40 + 18 = 58)

Counting method: one check = one `check(...)` invocation in the test source.

- **Database checks: 40.** Counted as `check "` invocations in `run-1.sh` (40 lines, one invocation per line). By section: §1 concurrency 4, §2 duplicates 3, §3 intent 7, §4 approval binding 5, §5 ownership/mandate 7, §6 transfer racing purchases 2, §7 state machine 9, §8 reconciliation/decline 3. Total 4+3+7+5+7+2+9+3 = 40.
- **Handler checks: 18.** Counted as `check("` occurrences in `handler.test-1.ts` (18 occurrences on 17 lines; two checks share one line in the bad-signature block, which is why a line count reads 17). Listed: happy path, bad signature, unverified payload not written, stale timestamp, fractional amount, negative amount, bad currency, wrong issuer, ownership changed, bad CIP-54 proof, NaN risk, out-of-range risk, high risk, deadline timeout, DB down spool, DB decision passthrough, retry of approved auth, dependency error.
- **Total 58**, matching Dot's "40 database checks and 18 handler checks" and the review's "58 passing tests".

### 3. Pair identity — shell VERIFIED; SQL NOT VERIFIED

- Shell pair: identical SHA-256 and empty `diff`. **VERIFIED.**
- SQL pair: base file missing; identity claim **NOT VERIFIED** (see Count Gap above).

### 4. Secrets scan — VERIFIED (none found)

Searched all five files for: `password`, `api_key`/`apikey`, `secret`, `token`, `bearer`, `postgres://`, `postgresql://`, `supabase.co`, `sk-` keys, `BEGIN ... PRIVATE KEY`, `aws_secret`, `connection string`. Only benign matches: identifier names (`cardToken`, `getCapabilityByToken`) and the test-fixture string `"tok_1"` in `handler.test-1.ts`. No passwords, API keys, live tokens, connection strings, or private keys. Matches Dot's report.

### 5. Match to the Nov 7 review — VERIFIED (including the open findings)

| Review claim | Recovered code | Verdict |
| --- | --- | --- |
| Transactional authorization | `p54_authorize` claims idempotency, locks, decision, and receipt in one plpgsql call | VERIFIED |
| Capability-level locking | `select ... for update` on `p54_capabilities` | VERIFIED |
| One-time intents | `consumed_at` set in the same decision; `intent_already_used` | VERIFIED |
| Versioned, one-way revocation | `p54_on_card_transfer` only where `owner_version < p_owner_version`, sets `revoked`, queues `suspend` | VERIFIED |
| Receipt outbox written in the authorization transaction | `p54__receipt` called inside `p54_authorize`/`p54_record_decline` before return | VERIFIED |
| Duplicate auth IDs protected by PK | `auth_id` primary key; 15 concurrent duplicates → 1 row, 1 receipt, same decision (suite §2, reproduced) | VERIFIED |
| Issuer lifecycle with explicit states and transition checks | State check constraint; `p54_apply_issuer_event` transition table with illegal-transition raise | VERIFIED |
| 58 tests / 26 clean DB runs | 58 counted and all passing in this verification (see §6); 26 historical runs NOT reproduced (6 clean runs here) | 58 VERIFIED; 26 NOT REPRODUCED |
| P0-1: RPC bypasses handler-only checks | `p54_authorize` verifies no issuer signature, CIP-54 proof, merchant allowlist, AEGIS risk, or kill switch; those exist only in the handler `.ts` | VERIFIED as a code property (finding stands) |
| P0-2: replay can change the original answer | `p54__replay` derives `approved` from the **current** state, not a stored original decision | VERIFIED empirically (Probe A below) |
| P0-3: issuer events lack amount/identity invariants | `p54_apply_issuer_event` checks no capture-vs-hold or refund-vs-captured bound, and no event authentication | VERIFIED empirically (Probe B below) |
| P1-1: timeout boundary hazard | Handler `authorize()` catches deadline → `recordDecline("timeout")`; the handler's own comment acknowledges the commit may have landed first | VERIFIED as a code property (finding stands) |
| P1-2: shell test begins with `drop schema public cascade` | `run-1.sh` line 8, exactly as the review says | VERIFIED; run only against the disposable instance |
| Real issuer integration still missing; CIP-54 verifier incomplete; FA54/issuer workers missing | Delivery contains only SQL + handler + tests; the handler's issuer/CIP-54/AEGIS/FA54 dependencies are injected interfaces with no implementations | VERIFIED consistent (nothing in the delivery contradicts it) |

### 6. Test runs — all green (on the (1) copy only)

**Environment (disposable, isolated):** PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1), installed via apt in the sandbox for this verification. Fresh cluster created with `initdb` in `/tmp/pgdata`, superuser `postgres`, trust auth, socket directory `/tmp/pg`, port 5544, `listen_addresses = ''` (no TCP). The server was stopped and the data directory deleted after the runs. No shared or live database was touched; no network access to real services.

**Substitution (recorded):** `run-1.sh` was run unmodified, with a byte-identical copy of the delivered `(1)` SQL placed at the path it expects (`../payrail54_authorize.sql` relative to the script). The handler test was run with a byte-identical copy of the delivered `(1)` handler at the path it imports (`../payrail54-authorize.ts`). Both substitutions are SHA-confirmed above.

**Database suite (`run-1.sh`): 40 passed, 0 failed — six consecutive clean runs** (run 1 full output in `run-1-output.log`; runs 2–6 each `40 passed, 0 failed`). The concurrency sections (§1 forty-way race, §2 fifteen-way duplicate race, §6 transfer-racing-purchases) passed on every run.

**Handler suite (`handler.test-1.ts`): 18 passed, 0 failed — under both Bun and Node 24.22.1** (exit 0 each; full output in `handler-test-output.log`). No database is involved in the handler suite; all dependencies are mocked.

**Probes confirming the review's P0 findings (same disposable instance, fresh schema):**

- **Probe A (P0-2):** `p54_authorize('probe1', …)` → `(t, ok, receipt 1)`. Then `issuer_approved` → `ISSUER_APPROVED`, `reversal` → `REVERSED`. Replaying the same auth id returned `(f, ok, receipt 1)`: approved flipped from true to false after the reversal, same receipt id. The original answer changed on replay, exactly as the review states.
- **Probe B (P0-3):** `p54_authorize('probe2', … 1000 …)` → RESERVED, held 1,000. `issuer_approved`, then `capture` of **99,999** succeeded → `held/captured/refunded = 0/99999/0`. Then `refund` of **200,000** succeeded → `0/99999/200000`. No capture-vs-hold or refund-vs-captured bound exists.

### 7. Provenance — REPORTED, not VERIFIED

Dot's delivery facts (recovered from the top level of ChatGPT Library on Nov 20, 2026; Library records show the files uploaded Nov 7) are taken as **Dot-reported**. The verifier cannot inspect ChatGPT Library records from this environment and does not verify them. What the verifier CAN confirm: the delivered `(1)` files match the Nov 7 review's description of the v2 source in function names, schema, behaviors, test counts, and the exact destructive first line of the shell test, and the suite runs green. That is strong evidence the files are the reviewed v2 source, but it is not proof of the Library upload dates.

## What is still missing (D-3 exit criteria)

1. **The base `payrail54_authorize.sql`.** Without it, the SQL pair-identity claim is unverified and the delivery is incomplete. Dot should supply it, or confirm in writing that the `(1)` copy is the only copy and the pair claim is withdrawn.
2. **A verifiable head SHA.** The files arrived as Library uploads, not from a repo. D-3's exit criterion (source located with a verifiable head SHA) needs the source placed in the PAYRAIL repo (or another named repo/branch/head) so the verified copy is addressable.
3. **The five P0/P1 remediations.** The recovered code is the reviewed, unremediated v2. P0-1 (RPC bypass), P0-2 (replay mutability), P0-3 (issuer-event invariants), P1-1 (timeout reconciliation), P1-2 (test-isolation guard) all still stand against this code, two of them now empirically confirmed. Remediation work (I-2) can start once items 1–2 land; nothing here authorizes live financial execution.
4. **The 26 clean DB runs.** Historical claim, not reproduced here (6 clean runs in this verification). A re-run count of 26 would require 20 more clean runs; the verifier did not consider that a blocking gap for D-3, but records it as not reproduced.

## Addendum — base SQL arrived as pasted text (Nov 22, 2026, 15:17 PT)

After this report was written, NEURO pasted the full text of the missing base `payrail54_authorize.sql` in chat (sent twice, identical text). VERITY saved it verbatim to `payrail54_authorize.sql` in this folder and diffed it against the uploaded `(1)` copy.

- **Result: BYTE-IDENTICAL.** Same SHA-256 `6e48028ab83cf56a4f86ab7a3e491b5635d9d513de244a48b9087e96a7f351fb`, same size 15,059 bytes, empty `diff`.
- **SQL pair identity: now VERIFIED**, with one channel caveat: the base copy's SHA is the SHA of pasted chat text, not of Dot's Library file itself. A paste could in theory differ from the file, but byte-identical match to the uploaded `(1)` copy strongly supports that both are the same Library content.
- **Delivery is now complete at six files.** Exit-criterion item 1 (missing base SQL) is closed.

**Revised D-3 position:** the recovered v2 source is genuine by every checkable measure (functions, 58 checks counted and run green, no secrets, review match including the open P0/P1 findings). What still stands between D-3 and moving: (a) a verifiable head SHA — the source must be placed in the PAYRAIL repo (or another named repo/branch/head) so the verified copy is addressable; (b) the five P0/P1 remediations (I-2) remain open before any production claim; (c) the 26 historical clean DB runs remain not reproduced (6 clean runs here; the verifier did not treat this as a blocking gap for D-3). Placement of the recovered source needs NEURO's go-ahead and a push approval card; nothing is pushed from this verification.

- This report: `VERIFICATION-REPORT.md` (this file)
- Full database suite output: `run-1-output.log` (40 PASS lines, run 1 of 6)
- Full handler suite output: `handler-test-output.log` (18 PASS lines, Bun run)
- Verified sources: `payrail54_authorize-1.sql`, `run-1.sh`, `run-1-1.sh`, `handler.test-1.ts`, `payrail54-authorize-1.ts`
- Upload originals (untouched): `~/workspace/user/files/` (`payrail54_authorize_1_.sql_101_jhjo.txt`, `run-1__1__102_vmub.sh`, `run-1_1__99_xm2f.sh`, `handler.test__1_-1_98_iy69.ts`, `payrail54-authorize__1_-1_100_kq4l.ts`, plus byte-identical duplicates `1000065346_103_d2q0.ts`, `1000065347_104_lsvc.ts`)

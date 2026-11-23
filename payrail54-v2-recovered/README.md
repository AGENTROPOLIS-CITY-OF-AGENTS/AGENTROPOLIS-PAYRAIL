# PAYRAIL54 v2 SQL, recovered

Recovered PAYRAIL54 v2 authorization source: the atomic authorization state
machine (Postgres/Supabase), its TypeScript handler, the shell test runner,
and the handler test suite. This is a recovery placement, not a new
implementation. Nothing here is merged, deployed, or authorized for live
funds.

## Provenance (reported, not independently verified)

DOT-54 reported recovering these six files from the top level of ChatGPT
Library on Nov 20, 2026. Library records show the files uploaded Nov 7,
2026. That Library history is Dot-reported; VERITY cannot inspect ChatGPT
Library records from her environment and does not verify the upload dates.

Delivery to NEURO arrived Nov 22, 2026 as seven uploads: the six files
below, plus one byte-identical duplicate each of the two `.ts` files. The
base `payrail54_authorize.sql` first arrived missing, then NEURO pasted its
full text in chat the same day. The pasted text was saved verbatim and is
byte-identical to the uploaded `(1)` copy (same SHA-256, empty diff). The
paste channel is the one caveat on the base file: its SHA is the SHA of
pasted chat text, not of Dot's Library file itself.

## Files and SHAs (SHA-256, verified Nov 22, 2026)

| File | Size | SHA-256 |
| --- | --- | --- |
| `payrail54_authorize.sql` | 15,059 B | `6e48028ab83cf56a4f86ab7a3e491b5635d9d513de244a48b9087e96a7f351fb` |
| `payrail54_authorize-1.sql` | 15,059 B | `6e48028ab83cf56a4f86ab7a3e491b5635d9d513de244a48b9087e96a7f351fb` |
| `run-1.sh` | 9,102 B | `0a88afea1cf05d2c13e89758879c681b593ea74e97ea6a8bab1ad4ce707ba124` |
| `run-1-1.sh` | 9,102 B | `0a88afea1cf05d2c13e89758879c681b593ea74e97ea6a8bab1ad4ce707ba124` |
| `handler.test-1.ts` | 5,032 B | `1bfbd0d5a12be0b35cefcc31010546faca816c67e05650eebd38e13b6523bca5` |
| `payrail54-authorize-1.ts` | 11,501 B | `1e012fa615365a03fdfa44fe83f588b05f2b309695390306b7b0b2175bea9ca8` |

The two SQL files are byte-identical; the two shell files are byte-identical.
Both copies are kept so the delivery is preserved exactly as received.

## What the code is

Postgres functions: `p54_authorize`, `p54__replay`, `p54_apply_issuer_event`
(the three the Nov 7, 2026 independent review names), plus `p54__receipt`,
`p54_record_decline`, `p54_on_card_transfer`, `p54_stale_reservations`.
Tables: `p54_capabilities`, `p54_intents`, `p54_approvals`,
`p54_authorizations`, `p54_issuer_events`, `p54_receipt_outbox`,
`p54_issuer_commands`. States: RECEIVED, RESERVED, ISSUER_APPROVED,
CAPTURED, SETTLED, REVERSED, DECLINED.

## Verification (VERITY, Nov 22, 2026)

Full report: `VERIFICATION-REPORT.md` in this directory.

- Function inventory: VERIFIED. All three review-named functions present
  with exact names; no undefined references; all 15 SQL decline reasons in
  the handler's `DeclineReason` union.
- Check counts: VERIFIED. 40 database checks + 18 handler checks = 58,
  matching Dot's count and the review's 58-test claim.
- Test runs, all green: database suite 40/40 across six consecutive clean
  runs on a disposable Postgres 16.15 cluster (created fresh in the sandbox,
  deleted after); handler suite 18/18 under both Bun and Node 24.22.1.
  The review's 26 historical clean DB runs were NOT reproduced (6 here);
  not treated as a blocker for locating the source.
- Secrets scan: VERIFIED none. No passwords, keys, tokens, or connection
  strings.
- Review match: VERIFIED, including the open findings below.

## Warning: this is the pre-remediation v2

The Nov 7 review's P0/P1 findings are confirmed present in this code.
Two were confirmed empirically by probes on the disposable instance:

- P0-2: replay can change the original answer. Authorize returned
  approved; after issuer approval and reversal, replay of the same auth id
  returned not approved, same receipt id.
- P0-3: issuer events lack amount and identity invariants. A capture of
  99,999 succeeded against a 1,000 hold; a refund of 200,000 succeeded
  against 99,999 captured. No capture-vs-hold or refund-vs-captured bound.
- P0-1: `p54_authorize` verifies no issuer signature, CIP-54 proof,
  merchant allowlist, AEGIS risk, or kill switch; those exist only in the
  handler. P1-1 (timeout boundary hazard) and P1-2 (the shell test drops
  the `public` schema) also stand.

Do not run this against a live or shared database. `run-1.sh` begins with
`drop schema public cascade`; run it only against a disposable, isolated
Postgres instance. Remediation of the five P0/P1 findings is I-2 work and
is not done here. Nothing in this directory authorizes live financial
execution.

## D-3 status

This placement supplies the second half of the D-3 acceptance criteria
(mentorship sprint, Arbitrum x Robinhood, deadline Dec 6, 2026): the source
was located on disk and verified Nov 22, 2026; placing it here gives it a
verifiable head SHA in this repo. D-3 clears when this branch and its draft
PR exist with the SHAs above confirmed. The I-3 escrow simulation
(`feat/escrow-state-machine-i3-20261122`, draft PR #24) remains separate
new code, not a recovery, and is unaffected by this placement.

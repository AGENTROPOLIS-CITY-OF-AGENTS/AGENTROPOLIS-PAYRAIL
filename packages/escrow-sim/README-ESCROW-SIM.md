# escrow-sim — Simulation-only escrow state machine

**SIMULATION ONLY. NEW implementation built Nov 22, 2026 for mentorship INTEGRATE task I-3. NOT the PAYRAIL54 v2 SQL. NOT a recovery. NOT a P0/P1 remediation. Does not verify CIP-54, the issuer adapter, or the FA54/issuer workers. D-3 stays BLOCKED.**

## What this is

A small, self-contained TypeScript escrow state machine with SQLite
persistence, built to the design in `SQL-RECOVERY-REPORT.md` Section 5
("Simulation-only fallback design") for mentorship task I-3. It models the
escrow leg only: create, fund, release, refund, dispute.

- States: `CREATED`, `FUNDED`, `RELEASED`, `REFUNDED`, `DISPUTED`.
  Terminal: `RELEASED`, `REFUNDED`.
- `release` requires BOTH an ENTITY54 ALLOW receipt AND a completion-evidence
  record. It never executes on an unsupported completion claim.
- `refund` requires an ALLOW receipt.
- From `DISPUTED`, only release (with evidence) or refund (with
  authorization) may close the escrow. No return to `FUNDED`.
- Illegal transitions throw `InvariantViolation` and write no state change.
- Every transition is idempotent on a caller-supplied event id: a replay
  returns the original receipt with no duplicate state change.
- The ALLOW receipt and the completion-evidence record are opaque
  caller-supplied data inputs. This engine never calls ENTITY54, PAYRAIL,
  any chain, wallet, or network.
- All amounts are integer minor units (`bigint` in code, decimal strings in
  receipts and SQLite). No floats in money.
- Every transition writes a hash-chained SHA-256 receipt over canonical
  key-sorted JSON, carrying the fixed clock value injected at construction,
  never wall-clock time, so a re-run is byte-identical.
- `LIVE_FUNDS_ENABLED` stays `false as const`. No wallet, no RPC, no
  signing, no network.

## Fund accounting

The four buckets partition the opening pool balance at every receipt:

`pool + escrowed + released + refunded = opening`

`fund` moves funds out of the pool into escrow. `release` moves them from
escrow into the released bucket (the seller). `refund` moves them from
escrow into the refunded bucket (the buyer). The pool balance itself
therefore changes only at `fund`. This is the only accounting under which
the conservation invariant holds after a refund, and it is checked after
every transition.

## What this is NOT

- Not the PAYRAIL54 v2 SQL. That source was not found anywhere reachable,
  and its existence is unverified.
- Not a recovery of anything.
- Not a P0/P1 remediation. It does not implement the Nov 7 review findings.
- Not a CIP-54 verifier, not an issuer adapter, not an FA54/issuer worker.
- Not connected to PAYRAIL, ENTITY54, or any chain. Any application text
  that mentions it must label it simulation-only.

## Files

| File | Contents |
| --- | --- |
| `src/escrow-states.ts` | State names, allowed-transition table, terminal states. |
| `src/escrow-engine.ts` | `EscrowEngine`: create, fund, release, refund, dispute, idempotent event ids, invariant checks. |
| `src/escrow-receipt.ts` | Canonical key-sorted JSON receipt, SHA-256 hash chain, verify function. |
| `src/escrow-store.ts` | SQLite store (`node:sqlite`, in-memory): escrows table, receipts table, event-id index, pool row. Schema only; no migration of any existing data. |
| `src/index.ts` | Public export surface. |
| `test/escrow-engine.test.ts` | Unit tests (Section 5.5, 11 tests). |

## Build and test

```sh
npm install
npm run build      # tsc
npm run typecheck  # tsc --noEmit
npm test           # tsc -p test/tsconfig.json && node --test test/dist-test/test/*.test.js
```

No runtime dependencies. Dev dependencies only: `typescript` and
`@types/node`. SQLite comes from Node's built-in `node:sqlite`
(`DatabaseSync`, in-memory).

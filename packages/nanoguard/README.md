# NanoGuard v0.1: chain-neutral synthetic reference kernel

Status: EXPERIMENTAL / NOT PRODUCTION READY. No chain signing, no RPC, no custody, no settlement integrations.

Run: `node --test packages/nanoguard/index.test.mjs` (Node >=20).

- Shared group budget applies across wallet and chain labels. Integer accounting units are provided by a trusted upstream valuation adapter.
- Reserve checks requested value + maximum fee against rolling spend and pending reservations.
- Failed transactions count their actual fees; unproven expiry retains reservations.
- New recipients HOLD; dormant wallets DENY; exact mandate and payload match flags are mandatory.
- This kernel accepts boolean attestations as test inputs, NOT cryptographic proof. A production adapter must verify actual serialized signing payloads and signed mandates independently.
- `userActivity` is a trusted administrative test hook. Production must authenticate user presence out-of-band.
- Single-process synchronous mutation is atomic only within one JS process. A distributed deployment REQUIRES a durable serializable transaction/lock with fencing and idempotency across instances, with a single globally consistent ledger.
- No FX conversion or quote haircut is implemented. Callers MUST convert to conservative common integer budget units; production must validate quotes, freshness, rounding and fees.
- No real escrow or retrieval integration. Existing PAYRAIL Stellar recovery rail and ARC CollateralAdapter require separate review.
- No evidence of tests executed in CI, independent security review, or live readiness.

Required before production: persistent ledger, signer identity binding, cryptographic mandate validation, real transaction decoding, settlement reconciliation, reorg/uncertain finality policy, risk-based velocity, proof-bound user regrant, safe freeze/unfreeze, telemetry and receipt audit, integration tests, external review.

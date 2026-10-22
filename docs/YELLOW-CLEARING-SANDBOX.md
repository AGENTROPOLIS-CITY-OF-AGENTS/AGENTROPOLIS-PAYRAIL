# Yellow clearing evaluation: mock-only adapter

**Status:** PROPOSED / TEST ONLY. No Yellow SDK, contract, or Arc integration is claimed.

This isolated TypeScript simulator computes bilateral net positions from integer-cent transfers, rejects duplicate IDs, and asserts conservation. It is deliberately not imported into any gateway, wallet, or production runtime.

## Run
On a Node.js version supporting TypeScript type stripping: `node --experimental-strip-types --test packages/yellow-clearing-sandbox/index.test.ts`.

## Governance boundary
FIN54 evidence -> ATG mandate -> AEGIS approval -> execution envelope -> PAYRAIL -> external adapter -> receipt/audit.

This simulator **does not** establish authorization, custody, counterparty solvency, settlement finality, signature validity, channel dispute safety, or receipt persistence. The output is an illustrative computation, **not** an immutable or externally verified settlement receipt.

## Exit criteria
Verify official Yellow protocol/SDK/Arc support, independent security reviews, fees, liveness, dispute paths, chain finality, token precision, and failure recovery. Define policy-bound requests, stable idempotency storage, durable audit evidence, and a separate approved adapter before even testnet connection. No mainnet or real funds without explicit approval and VERITY assurance.

# APEX54 / Escrow Vault / FHE — Canonical Authority and Verification Boundaries

Status: DRAFT FOR REVIEW. This document does not authorize production funds movement.

## Canonical namespace correction (2026-11-07)

- **APEX54**: independent security assurance, verification, audit evidence, policy conformance, and denial/approval proof checking. Former use of **VERITY** as this verifier is deprecated.
- **VERITY**: separate Muse AI identity. It must not be referenced as the financial or escrow verifier.
- **VAULT33**: historical escrow vault/custody-and-release concept; deployment and canonical implementation remain UNVERIFIED.
- **WALLET54**: wallet capability surface; agent cannot possess raw spending keys.
- **ENTITY54**: verified identity, scoped mandates, revocation, authority.
- **54-T / AEGIS**: enforce security/risk gates; APEX54 independently assesses resulting evidence.
- **MATH54**: exact integer financial arithmetic, netting, conservation and benchmark evaluation.
- **HUSH54 / GHOST54**: proposed confidentiality governance / leakage-monitoring integrations, respectively; runtime implementation UNVERIFIED.
- **OMNIRAIL54**: routing/selection; cannot sign or bypass policy.
- **PAYRAIL**: payment execution, settlement reconciliation and financial receipts; trading execution remains with the authorized trading adapter.
- **Fluton/FHE**: research-only confidential computation/execution candidate, not a verified provider, chain, wallet or custody service.
- **AGENTROPOLIS-ARC**: independent first-class ecosystem and selectable rail.

## Authority corridor

Identity -> Mandate -> Intent -> Simulation -> Policy -> Guardian approval (where required) -> Escrow hold/release -> Authorized execution adapter -> Settlement evidence -> PAYRAIL accounting where applicable -> APEX54 independent verification -> Audit.

APEX54 does not hold signing keys, grant its own approval, or replace the settlement ledger. APEX54 verification is independent from the action it evaluates.

## Mandatory invariants

1. No agent access to raw private keys or unrestricted signing authority.
2. Every release binds chain, asset, integer amount, destination, contract, expiry, nonce, mandate ID, policy version, simulation digest and approval proof.
3. All monetary values use exact integer smallest-unit accounting; enforce conservation and fee accounting.
4. Atomic durable limits across restarts, processes, concurrent workers and retries; idempotency keys are unique per economic action.
5. No release if any required check, guardian quorum, proof, signer or settlement evidence is missing or invalid.
6. Privacy-required requests fail closed if an eligible confidentiality provider cannot meet the documented threat model. No silent public downgrade.
7. FHE encryption does not itself prove MEV elimination, hide network metadata, enforce custody, or authorize release.
8. Recovery claims must specify the actual escrow/issuer mechanism and stop at irreversible settlement boundaries.
9. Emit tamper-evident approval, denial, execution, finality and reconciliation receipts; minimize sensitive evidence and use selective disclosure.
10. APEX54 assurance must be independently reproducible and cannot self-certify its own financial action.

## Evidence and current gaps

- PAYRAIL `packages/wallet-guard/src/index.ts` currently uses an in-memory daily-spend Map with restart reset warning. It is NOT production-grade durable spend enforcement.
- The same policy function returns SIMULATED early when dryRun is true; simulated approval must never be mistaken for real authorization.
- PAYRAIL README marks full wallet-guard evaluation, persistence, production replay/concurrency protection and live settlement as roadmap items.
- PAY PROTOCOL README is explicitly `0.1.0-draft`, an authority specification rather than a payment processor.
- Stellar recovery documentation labels its Rust core a scaffold requiring testnet and audit.
- Historical VAULT33 design and Fluton claims require contract, deployment, key-trust and security evidence before production claims.

## MATH54 / STEM54 qualification

- Exact correctness: 100% supported integer vectors, including boundary, overflow and cross-asset unit tests.
- Conservation: initial balance + deposits = authorized releases + fees + remaining balance.
- Confidentiality: threat-model-driven cryptographic review plus adversarial inference/leakage tests.
- MEV: controlled paired execution tests, reporting p50/p95/p99 latency, realized execution cost and uncertainty.
- Economics: per-payment effective cost includes FHE, proof, settlement, operations, batching failures and amortization.
- Faults: concurrency, restart, replay, reorg, provider outage, key loss, guardian disagreement, chain switch, privacy downgrade.
- Independent audit and testnet pilot required; live value is forbidden until explicit approval.

## Change-control and migration

1. Replace *financial verifier* references to VERITY with APEX54 only after reviewing context. Do not rename the separate Muse AI identity.
2. Update OMNIRAIL54 issue #21 and dependent documentation to use APEX54.
3. Inventory VAULT33, WALLET54 and actual escrow implementations; preserve separate namespaces until provenance is established.
4. Remediate durable spend tracking and authorization gating in code via separate reviewed PRs.
5. Qualify Fluton only after real SDK/contracts, audit, supported networks, leakage, performance and economic evidence.
6. No mainnet deployment, funds transfer or production enablement under this documentation change.

## Evidence pointers

- `AGENTROPOLIS-PAYRAIL/README.md`
- `AGENTROPOLIS-PAYRAIL/packages/wallet-guard/src/index.ts`
- `AGENTROPOLIS-54T/anti-moloch/policies/wallet-guard.yaml`
- `AGENTROPOLIS-PAY-PROTOCOL/README.md`
- `AGENTROPOLIS-PAYRAIL/docs/STELLAR-RECOVERY-RAIL.md`

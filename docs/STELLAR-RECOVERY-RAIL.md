# Stellar Recovery Rail

## Status

Rust-first enforcement scaffold. Testnet and audit required before any real-value activation.

## Placement

This is an Intelligence Grid infrastructure capability owned by AGENTROPOLIS-PAYRAIL. Fiscal districts and applications consume it; they do not implement independent recovery engines.

## Asset boundaries

| Asset state | Trace | Hold/freeze | Post-settlement recovery |
|---|---:|---:|---:|
| Native XLM | Yes | Before submission | No |
| Clawback-enabled issuer asset | Yes | Yes | Issuer clawback under disclosed governance |
| Value held in Soroban escrow | Yes | Yes | Yes while contract custody persists |
| Native BTC/external irreversible rail | Yes | Before release | No unilateral recovery |

XLM is for fees and reserves. It is not represented as recoverable after settlement.

## Required corridor

Identity -> Mandate -> Intent -> Simulation -> Policy -> Guardian quorum -> Escrow -> Settlement -> Receipt -> Audit

## Mandatory controls

- per-transaction and daily ceilings
- maximum reserve-outflow basis points
- destination allowlists
- anomaly-triggered denial
- cooling window for recoverable settlement
- non-zero guardian quorum for irreversible or high-value execution
- no raw signing keys in agents, browser code, logs, prompts, or receipts
- private provenance evidence with public hash commitments
- explicit recovery-boundary field on every receipt
- circuit breaker before bridge or anchor release
- no claim that metadata reveals physical location or guarantees retrieval

## LIQUID-4000 regression

A transaction draining 95% of reserves must be denied even if its signatures and integration credentials are valid. Authorization identity and economic safety are evaluated separately.

## Rust ownership

`packages/stellar-recovery-rail` owns deterministic policy evaluation. Stellar/Soroban, anchors, bridges, databases, and signing providers are adapters and must not bypass the policy result.

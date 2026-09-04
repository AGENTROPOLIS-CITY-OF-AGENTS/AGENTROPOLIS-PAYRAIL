# Rust Core Architecture

AGENTROPOLIS-PAYRAIL is **Rust-first for all production payment-critical logic**.

## Decision

Use Rust for:

- mandate and payment-intent validation
- wallet/spend guard policy evaluation
- budget counters and approval thresholds
- idempotency, replay protection, and concurrency locks
- receipt creation, hashing, signing, and verification
- x402 request/payment verification
- settlement adapters and callback verification
- district billing aggregation
- audit-ledger event generation

Keep TypeScript for:

- operator dashboards
- browser-facing admin tools
- non-authoritative SDK ergonomics
- prototype/demo surfaces that cannot move funds

## Provider boundary

Aeron, XRPL, Base/USDC, Stripe, and future rails are adapters behind a provider-neutral Rust trait. No provider may bypass Identity -> Mandate -> AEGIS Policy -> Approval -> Execution -> Receipt -> Audit.

## Aeron/x402 profile

Aeron may be integrated as an external economic rail. Agentropolis does not inherit Aeron token economics. The adapter must bind host, amount, budget, expiry, agent identity, task, mandate, and receipt evidence. Settlement evidence must be reconciled with an Agentropolis execution receipt.

## Production rule

No TypeScript service may hold signing authority or independently approve/execute a live payment. Live settlement requires Rust policy enforcement plus external/key-isolated signing.

**Authority is not a prompt. It is a runtime constraint.**

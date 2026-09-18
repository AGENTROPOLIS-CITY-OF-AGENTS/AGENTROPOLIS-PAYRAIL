# AGENTROPOLIS-PAYRAIL

> **"No agent gets raw wallet power."**

The micropayment rail for autonomous agents inside **Agentropolis**. AGENTROPOLIS-PAYRAIL handles district billing, wallet guardrails, task receipts, spending limits, dry-run mode, and audit-safe AI commerce.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-finance--core-orange)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-interface-blue)](https://www.typescriptlang.org/)
[![pnpm workspaces](https://img.shields.io/badge/pnpm-workspaces-orange)](https://pnpm.io/workspaces)

---

## What Is This?

AGENTROPOLIS-PAYRAIL is the financial nervous system of Agentropolis, a city-scale multi-agent simulation where every agent, district, and NPC can request and settle micropayments for tasks. The rail ensures:

- **Agents never hold raw private keys**: all payment authority flows through policy-gated guardrails.
- **Every task creates an auditable receipt**: immutable, structured, query-able.
- **Spending is bounded by policy**: per-task limits, daily limits, approval thresholds.
- **Dry-run mode**: all flows can be simulated without moving real funds.
- **District billing**: costs are attributed to the correct district/department.
- **XRPL ready settlement lane**: XRP and RLUSD are tracked as first-class candidate rails for agentic payments.

---

## XRPL AI Hub Alignment

The XRPL AI Hub at `https://xrpl-ai.org/` gives the XRP Ledger AI ecosystem a public discovery layer for agents, AI projects, x402 services, tools, merchants, and live payment endpoints.

AGENTROPOLIS-PAYRAIL should treat this as an external ecosystem map, not as a replacement for internal finance controls.

### Integration Targets

| Target | PAYRAIL Role | Guardrail |
|--------|--------------|-----------|
| XRPL x402 services | Agent payable endpoint discovery | Policy check before every call |
| XRP settlement | Optional live rail | No raw wallet custody inside agents |
| RLUSD settlement | Stable payment option | Per-task and daily limits |
| XRPL AI Directory | Public listing path for approved Agentropolis services | Only list production-safe endpoints |
| Verifiable intent | Consent and authorization signal | Bind receipt to task, endpoint, price, and agent identity |

### Required Safety Rules

- Do not expose seed phrases, private keys, or signing credentials to agents.
- Default all XRPL and x402 flows to dry-run until an operator explicitly enables live settlement.
- Bind each payment receipt to the exact task, endpoint, amount, token, agent, district, and timestamp.
- Add replay protection before live settlement.
- Add concurrency protection so one payment proof cannot be reused across multiple service calls.
- Require manual approval above the configured high-value threshold.

---

## Stellar Recovery Rail

PAYRAIL now owns a Rust-first, fail-closed recovery-policy core at `packages/stellar-recovery-rail`.

- XLM is used for Stellar fees and reserves; native XLM is not described as recoverable after settlement.
- Recoverable flows use audited Soroban escrow or a disclosed clawback-enabled issuer asset.
- Transaction, daily, reserve-outflow, destination, anomaly, cooling-window, and Guardian-quorum controls execute before signing.
- Native BTC and other external irreversible assets remain unrecoverable once released from controlled escrow.
- Fiscal applications consume signed policy decisions and receipts; browser and agent layers cannot override them.

See [`docs/STELLAR-RECOVERY-RAIL.md`](docs/STELLAR-RECOVERY-RAIL.md).

---

## Architecture

```
AGENTROPOLIS-PAYRAIL/
├── apps/
│   ├── gateway-api/        # REST gateway, agent-facing payment API
│   └── dashboard/          # Ops dashboard (coming soon)
│
├── packages/
│   ├── payrail-core/       # Shared types, utilities, constants
│   ├── stellar-recovery-rail/ # Rust fiscal policy and recovery-boundary engine
│   ├── wallet-guard/       # Policy engine, enforces spend limits and guardrails
│   ├── receipt-engine/     # Creates, validates, and stores task receipts
│   ├── pricing-rules/      # District pricing rules (JSON-configurable)
│   └── x402-adapter/       # x402 settlement adapter, Base/USDC now, XRPL/XRP/RLUSD next
│
└── recipes/
    ├── whale-watcher-54/          # Monitors wallet activity, mock alert + receipt
    ├── osint-fee-search/          # OSINT fee estimation recipe
    ├── terra54-property-check/    # Property data lookup recipe
    └── npc-prompt-execution/      # NPC task execution via prompt
```

### Request Flow

```
Agent Task Request
      │
      ▼
 gateway-api  ──►  wallet-guard (policy check)
      │                  │
      │          [policy: allowed / dry-run / blocked]
      │                  │
      ▼                  ▼
 pricing-rules      receipt-engine
      │                  │
      ▼                  ▼
 x402-adapter  ──►  [dry-run first, live settlement only when approved]
      │
      ▼
 Task Receipt  ──►  audit log
```

---

## Safety Model

| Principle | Implementation |
|-----------|---------------|
| No raw wallet power | Agents receive signed receipts, never keys |
| Policy-gated spending | `wallet-guard` enforces per-task and daily limits |
| Dry-run by default (dev) | `dryRun: true` in policy, no funds move |
| Audit trail | Every task generates a structured receipt |
| Blocked districts | Policy denies payments to restricted districts |
| Approval threshold | Amounts above threshold require explicit approval |
| No seed phrase storage | x402-adapter uses external signing, never stores mnemonics |
| XRPL hardening | Payment proofs must be task-bound and replay-protected |

---

## MVP Roadmap

### Phase 0 - Scaffold ✅
- [x] Monorepo structure (pnpm workspaces)
- [x] TypeScript configs
- [x] Gateway API with health check
- [x] Wallet guard policy schema
- [x] Receipt schema
- [x] Pricing rule examples
- [x] Whale Watcher 54 recipe (mock)

### Phase 1 - Core Plumbing
- [ ] Full wallet-guard policy evaluation engine
- [ ] Receipt persistence (SQLite / Postgres)
- [ ] Gateway API `/pay` endpoint (dry-run only)
- [ ] District billing aggregation
- [ ] Dashboard skeleton

### Phase 2 - Settlement
- [ ] x402 integration (external signing service)
- [ ] USDC on Base testnet (dry-run to real)
- [ ] XRPL x402 adapter spike for XRP and RLUSD
- [ ] XRPL AI Hub service listing checklist
- [ ] Approval flow for high-value tasks
- [ ] Webhook receipt delivery

### Phase 3 - Production
- [ ] Multi-district policy management
- [ ] Real-time spending dashboard
- [ ] Audit export (CSV / JSON)
- [ ] Rate limiting and agent authentication
- [ ] Replay and concurrency protection for paid agent calls

---

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 9+

pnpm install
pnpm build
pnpm --filter gateway-api dev
```

Health check: `GET http://localhost:3000/health`

---

## License

Apache-2.0, see [LICENSE](LICENSE).

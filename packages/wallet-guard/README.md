# wallet-guard

> Policy engine — enforces spend limits and guardrails for AGENTROPOLIS-PAYRAIL

> **"No agent gets raw wallet power."**

## Overview

`wallet-guard` evaluates every payment request against a structured policy **before** any settlement is attempted. It never handles private keys, seed phrases, or signing keys.

## Policy Fields

| Field | Type | Description |
|-------|------|-------------|
| `policyId` | string | Unique policy identifier |
| `agentId` | string | Agent this policy governs (`"*"` = global default) |
| `maxSpendPerTaskMinorUnits` | string | Max USDC minor units per individual task |
| `maxSpendPerDayMinorUnits` | string | Max USDC minor units per day |
| `approvalThresholdMinorUnits` | string | Minor-unit amount at or above this requires human/supervisor approval |
| `allowedDistricts` | string[] | Permitted districts (`["*"]` = all except blocked) |
| `blockedDistricts` | string[] | Districts always denied |
| `dryRun` | boolean | `true` = simulate only, no real funds |

## Usage

```ts
import { evaluatePolicy, DEFAULT_DEV_POLICY } from "@agentropolis/wallet-guard";

const decision = evaluatePolicy(paymentRequest, DEFAULT_DEV_POLICY);
if (!decision.allowed) {
  console.warn("Blocked:", decision.reason);
}
```

## Schema

See [`src/schemas/wallet-guard-policy.schema.json`](src/schemas/wallet-guard-policy.schema.json) for the full JSON Schema.

## TODO

- Phase 1: Load policies from a persistent store (DB / config file)
- Phase 1: Replace in-memory daily spend tracker with Redis/Postgres
- Phase 2: Supervisor-agent approval flow for high-value tasks
- Phase 2: Policy audit log (who changed what, when)

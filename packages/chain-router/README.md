# @agentropolis/chain-router

PAYRAIL consumer for Genesis Spawn Chain Oracle decisions.

## Boundary

```text
GENESIS SPAWN
  -> AEGIS
  -> XENTS CAPITAL GRID / CHAIN ORACLE
  -> ChainRouteDecision
  -> PAYRAIL chain-router
  -> settlement adapter
```

This package **does not rank chains** and **does not authorize launches**.

It verifies that the upstream decision:

- selected a chain;
- carries Genesis Spawn, AEGIS and Launch Escrow references;
- marked the selected candidate execution-eligible;
- has explicit execution authorization;
- meets the requested adapter-maturity gate.

## Arc

Arc remains an existing PAYRAIL settlement adapter track. The Chain Oracle does not duplicate Arc integration. It decides whether Arc or another eligible rail should be selected for a given economic execution.

## Safety

- no raw wallet power;
- no private keys or seed phrases;
- no implicit production enablement;
- adapter maturity is checked separately from architectural chain eligibility;
- a high Chain Oracle score is not launch authority.

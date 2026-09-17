# Economic Fabric and Settlement Routing

Status: CANONICAL DIRECTION

AGENTROPOLIS-PAYRAIL is the governed payment and settlement control plane for AGENTROPOLIS.

ATG expresses economic intent and constraints. PAYRAIL owns settlement-route evaluation and adapter selection. Settlement providers execute only after policy and authority checks succeed.

## Canonical flow

```text
AGENT-ENTITY
  -> ATG economic intent
  -> Execution Envelope
  -> AEGIS / economic policy checks
  -> PAYRAIL
  -> eligible rail evaluation
  -> Arc / Base / XRPL / bank rail / future adapter
  -> settlement finality verification
  -> signed economic receipt
  -> AGENT-ENTITY state transition
  -> audit
```

## PAYRAIL responsibilities

PAYRAIL owns:

- spend-limit enforcement;
- approval thresholds;
- rail eligibility evaluation;
- pricing and fee awareness;
- custody/signing boundaries;
- replay and concurrency protection;
- settlement adapter selection;
- finality verification;
- economic receipt creation;
- district and entity billing attribution.

PAYRAIL does not own AGENT-ENTITY identity and does not grant authority merely because a wallet, chain, or provider is connected.

## Rail selection criteria

Eligible settlement infrastructure may be evaluated using:

- asset support;
- chain / network support;
- cost and fee policy;
- finality requirements;
- liquidity / availability;
- jurisdiction and compliance constraints;
- custody requirements;
- counterparty requirements;
- user or mandate preferences;
- privacy policy;
- risk tier;
- service health;
- settlement deadline.

## Arc boundary

Arc is a settlement capability/provider beneath PAYRAIL and the Economic Fabric.

Arc does not:

- own AGENT-ENTITY identity;
- define AGENTROPOLIS authority;
- become the treasury brain;
- replace PAYRAIL policy;
- own social, gaming, creator, or world state.

Arc may execute approved settlement operations when selected by PAYRAIL.

## Ownership and control changes

A request to transfer value or an asset does not itself authorize an AGENT-ENTITY ownership/control mutation.

Authoritative state changes occur only after the required settlement condition is verified and the resulting receipt is accepted by policy.

## Standing rule

> ATG says what the economic action means. PAYRAIL decides how approved value moves. Settlement adapters move it. Receipts prove it. AGENT-ENTITY records the resulting persistent state.

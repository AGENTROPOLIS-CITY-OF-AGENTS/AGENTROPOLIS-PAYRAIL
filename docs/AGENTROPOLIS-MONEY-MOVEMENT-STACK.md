# AGENTROPOLIS Money Movement Stack

## Purpose

AGENTROPOLIS mirrors the strongest architectural idea in Polygon's Open Money Stack without coupling the City to Polygon or any single chain.

The City owns identity, mandate, authority, policy, execution constraints, receipts, and audit. PAYRAIL owns payment orchestration. WORLD GRID owns rail discovery and governed routing. Settlement adapters remain replaceable.

## Canonical stack

```text
USER / BUSINESS / AGENT-ENTITY
          |
          v
AGENTROPOLIS GOVERNANCE
Identity -> Mandate -> AEGIS Policy -> Execution Envelope
          |
          v
PAYRAIL
Wallet orchestration
Stablecoin / token selection
Fiat ramp adapters
Compliance-provider adapters
x402 / machine-payment adapters
Pricing + limits + approvals
Settlement intent
          |
          v
WORLD GRID FINANCIAL ROUTER
Route discovery
Jurisdiction checks
Cost / latency / finality scoring
Interoperability selection
          |
     +----+-----+---------+---------+
     |          |         |         |
     v          v         v         v
 Polygon      Arc       XRPL     Other rails
 OMS /        CCTP      RLUSD    L1 / L2 /
 AggLayer     Gateway   XRP      banking
     |          |         |         |
     +----------+---------+---------+
                |
                v
        SIGNED SETTLEMENT RECEIPT
                |
                v
        AUDIT LEDGER / PROVENANCE
```

## Mapping from the Polygon model

| Polygon pattern | AGENTROPOLIS mirror |
|---|---|
| OMS unified payment API | PAYRAIL governed payment API |
| Wallet orchestration | AGENT-ENTITY wallet abstraction + external signers |
| Fiat on/off ramps | PAYRAIL ramp adapters |
| KYC / AML integrations | AEGIS compliance gates + provider adapters |
| Intent routing | WORLD GRID financial route selection |
| AggLayer interoperability | WORLD GRID interoperability adapters |
| Polygon settlement | Replaceable settlement adapters |
| Machine micropayments | x402 + channel / streaming-payment adapters |
| Enterprise API | PAYRAIL gateway API |
| Settlement records | Signed receipts + Audit Ledger |

## Core laws

1. **No agent gets raw wallet power.**
2. **Payment intent is not payment authority.**
3. **PAYRAIL owns payment orchestration; WORLD GRID owns rail selection.**
4. **AEGIS can deny a route even when the route is technically reachable.**
5. **No chain, bridge, wallet provider, bank, OMS, or interoperability protocol becomes City authority.**
6. **All external money systems are adapters and may be replaced.**
7. **Every live payment must bind agent identity, mandate, task, amount, asset, counterparty, route, jurisdiction, timestamp, and receipt.**
8. **Nanopayments may be aggregated offchain or in channels before L2/L1 settlement, but audit provenance must survive aggregation.**
9. **Unknown compliance, liquidity, finality, or network state fails closed when policy requires certainty.**
10. **Routing optimizes only inside an already-authorized execution envelope.**

## Polygon adapter

Polygon is treated as a financial rail, not as the foundation of AGENTROPOLIS.

Potential adapter capabilities:

- Polygon OMS API integration when production access is appropriate
- stablecoin on/off-ramp routing
- embedded-wallet integration through approved providers
- x402 agent and machine payments
- AggLayer interoperability
- Polygon PoS settlement
- ERC-8004 identity/reputation signals as evidence only, never City authority
- payment-channel aggregation for high-frequency micro/nanopayments

```text
AGENT-ENTITY
  -> MANDATE
  -> AEGIS
  -> EXECUTION ENVELOPE
  -> PAYRAIL
  -> WORLD GRID
  -> POLYGON ADAPTER
       -> OMS
       -> x402
       -> AggLayer
       -> Polygon settlement
  -> RECEIPT
  -> AUDIT
```

## Mastercard / machine-payment boundary

Mastercard Agent Pay for Machines and other card/account/stablecoin networks may be integrated as external financial rails through PAYRAIL adapters.

They do not grant agent authority. AGENTROPOLIS must still determine:

- who the agent is
- what mandate authorizes the purchase
- spending and velocity limits
- approved counterparties and jurisdictions
- whether human approval is required
- evidence and receipt requirements
- failure / reversal / dispute policy

## Nanopayment hierarchy

For payments too small to economically settle individually:

```text
Agent action
  -> metered usage
  -> channel / streaming balance / x402 authorization
  -> aggregate net settlement
  -> L2 or specialized payment rail
  -> optional L1 finality
  -> AGENTROPOLIS receipt + audit
```

The City records the economic intent and provenance even when many tiny updates are collapsed into one settlement transaction.

## Anti-lock-in rule

AGENTROPOLIS must be able to route around any single provider.

```text
POLYGON != PAYRAIL
ARC != PAYRAIL
XRPL != PAYRAIL
MASTERCARD != PAYRAIL
OMS != PAYRAIL
AGGLAYER != WORLD GRID
CHAIN REACHABILITY != AUTHORITY
CHEAPEST ROUTE != AUTHORIZED ROUTE
```

The target state is a governed, modular financial fabric where agents can transact across multiple rails without any rail becoming sovereign over the City.

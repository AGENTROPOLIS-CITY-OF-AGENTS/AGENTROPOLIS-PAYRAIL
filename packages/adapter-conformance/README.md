# PAYRAIL Adapter Conformance

This package is the engineering gate between **Chain Oracle ranking** and an actual settlement/token-launch implementation.

## Reference lanes

- Arc
- Base
- Robinhood Chain / Bags
- XRPL

## Production rule

A chain can be architecturally excellent and still fail production conformance.

Production requires:

- Genesis Spawn approval
- AEGIS approval
- Execution Envelope binding
- Launch Escrow where capital is involved
- no raw agent keys
- external signing boundary
- replay protection
- idempotency
- finality verification
- spend ceilings
- canonical asset identity
- continuity/migration support
- receipts
- a production-maturity adapter

Current reference manifests intentionally remain non-production until those implementation gates are actually satisfied.

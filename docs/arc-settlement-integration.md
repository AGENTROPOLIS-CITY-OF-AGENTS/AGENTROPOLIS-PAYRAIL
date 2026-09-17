# Arc Settlement Integration

Status: guarded reference implementation

Arc is an optional settlement rail beneath AGENTROPOLIS governance. It is not a policy engine, treasury authority, identity system, or replacement for PAYRAIL.

## Canonical Corridor

```text
AGENT / AGENTENTITY ECONOMIC INTENT
  -> PAYRAIL gateway
  -> wallet-guard
  -> ATG compiled policy
  -> Execution Envelope
  -> AEGIS / fiscal gate
  -> x402 / settlement adapter
  -> external signer
  -> selected rail (Arc, Base, XRPL, etc.)
  -> settlement receipt
  -> audit / ontology / drift monitoring
```

No settlement rail may bypass the corridor.

## Arc Network Posture

### Arc Testnet

The compiled testnet profile uses currently verified public network metadata:

- chain id: `5042002`
- native gas token: USDC
- native gas decimals: 18
- PAYRAIL confirmation floor: 1 deterministic-finality confirmation
- RPC is supplied through `ARC_TESTNET_RPC_URL`
- explorer: `https://testnet.arcscan.app`
- `dryRunByDefault: true`

### Arc Mainnet

Arc mainnet is treated as a supported target, but its chain metadata is deliberately not hard-coded here until independently verified against current Arc mainnet network documentation.

Activation requires all of the following:

1. verified chain id and RPC configuration;
2. external signer / wallet provider;
3. wallet-guard approval;
4. Execution Envelope reference;
5. AEGIS decision reference;
6. task-bound receipt id;
7. replay and concurrency protection;
8. operator-controlled live-settlement flag.

Until all gates exist, the adapter must refuse live settlement.

## AGENTENTITY Boundary

AGENTENTITY owns persistent entity identity, provenance, portable state, memory boundaries, game lineage, and ownership semantics. PAYRAIL owns payment intent, policy-gated settlement, and economic receipts.

PAYRAIL must never embed private AGENTENTITY memory, credentials, signing material, or private owner context into a settlement request or receipt.

### Human-to-human Agent TCG trade

```text
Human A owns AGENTENTITY: RED FANG
  -> trade intent
  -> AGENTENTITY validates transferable game state
  -> PAYRAIL prices and authorizes economic intent
  -> Execution Envelope + AEGIS gate
  -> Arc/USDC settlement adapter
  -> settlement receipt
  -> AGENTENTITY ownership transfer
  -> Human B receives RED FANG
  -> public lineage + permitted portable battle state move
  -> Human A private memory + secrets remain owner-bound
```

Settlement does not itself transfer the entity. The AGENTENTITY layer consumes a successful, task-bound settlement receipt and performs the governed ownership transition.

## Reference Game Profile

The first reference application can be `AGENTENTITY::GAME::TCG`:

- humans collect and command Agent Entities;
- Agent Entities battle within a competitive intelligence envelope;
- battle/evolution/achievement state is portable according to profile rules;
- economic trades use PAYRAIL intents and receipts;
- Arc can serve as a USDC settlement rail;
- blockchain ownership is optional at the AGENTENTITY protocol layer.

## Required Invariants

- No agent gets raw wallet power.
- No private keys or seed phrases in prompts, receipts, logs, or entity state.
- Arc is a rail, not the economic brain.
- Base remains the default EVM lane unless policy routing selects another rail.
- Mainnet remains dry-run/configuration-only until its current network metadata and signer path are verified.
- A payment success cannot silently imply an AGENTENTITY transfer.
- Entity transfer must be atomic/idempotent at the application layer and reference the settlement receipt.
- Previous-owner private memory and credentials never transfer with a traded Agent Entity.
- Every consequential action emits a receipt.

## Next Implementation Gates

1. Add Arc mainnet metadata only after current official verification.
2. Add external signer provider interface.
3. Implement x402 request/response verification.
4. Add replay/idempotency keys to settlement calls.
5. Bind receipt-engine settlement records to rail and chain id.
6. Add testnet end-to-end trade fixture for `AGENTENTITY::GAME::TCG`.
7. Add failure-path tests: signer unavailable, policy denied, expired envelope, replay attempt, settlement succeeds/entity transfer fails.
8. Add compensating-state workflow so settlement and entity transfer cannot drift silently.

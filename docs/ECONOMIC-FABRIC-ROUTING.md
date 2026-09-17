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
  -> sponsored-fee / fee-abstraction check
  -> Arc / Base / Solana / Robinhood Chain / XRPL / Stellar / Hedera / Monero / bank rail / future adapter
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
- gas / fee sponsorship policy;
- custody/signing boundaries;
- replay and concurrency protection;
- settlement adapter selection;
- finality verification;
- economic receipt creation;
- district and entity billing attribution.

PAYRAIL does not own AGENT-ENTITY identity and does not grant authority merely because a wallet, chain, or provider is connected.

## Sponsored-fee invariant

User-facing and agent-facing execution is **sponsored-first**.

```text
GAS_POLICY = SPONSORED_FIRST
USER_NATIVE_GAS_REQUIRED = FALSE_BY_DEFAULT
UNSPONSORED_NORMAL_FLOW = INELIGIBLE
```

PAYRAIL must prefer native sponsorship, a distinct fee payer, account-abstraction paymasters, relayers, protocol fee-bump mechanisms, or an explicitly governed managed-fee abstraction.

If a rail cannot satisfy this invariant for the requested execution mode, PAYRAIL must either:

1. select another eligible rail;
2. use a separately approved managed-fee abstraction; or
3. block the live route and remain in dry-run / read-only mode.

Native gas or fee-token exposure must not be silently pushed onto the user or AGENT-ENTITY.

## Canonical rail roles

| Rail | Primary role | Sponsorship / abstraction posture |
|---|---|---|
| Arc | Stable settlement, USDC, x402 and agent commerce | Sponsorship required; use Circle gas-abstraction / gasless payment capabilities where supported |
| Base | General EVM application commerce, creator and consumer flows | Paymaster / smart-wallet sponsorship preferred |
| Solana | High-frequency payments, gaming, creator economy and micropayments | Separate fee payer / fee-abstraction service |
| Robinhood Chain | RWA and capital-market execution corridor | ERC-4337 / gas sponsorship infrastructure |
| XRPL / XRP | Payments, liquidity and settlement | Native Sponsored Fees and Reserves when enabled; otherwise dry-run or approved abstraction |
| Stellar / XLM | Cross-border and remittance settlement, stablecoin corridors | Fee-bump / sponsored reserve model |
| Hedera / HBAR | Enterprise settlement, token service and EVM-compatible execution | Separate fee payer and HBAR gas allowance patterns |
| Monero / XMR | Privacy-preserving settlement under Hush54 governance | No native third-party fee sponsorship; managed-fee abstraction only, policy-gated |
| Bank / fiat rails | Off-chain regulated settlement | Provider fee abstraction and policy-gated execution |

These are capabilities beneath PAYRAIL. None of them becomes the economic brain, identity system, or authority layer of AGENTROPOLIS.

## Extended omnichain inventory

Existing AGENTROPOLIS / Wired Chaos repositories also contain chain-specific work for Ethereum, Polygon, Cronos, TRON, Dogecoin, Bitcoin, Cardano and other networks.

Those networks remain valid candidates for adapters, but app-local chain lists do not define system-wide settlement policy.

The canonical rule is:

```text
application / district
  -> chain capability request
  -> PAYRAIL eligibility
  -> AEGIS policy
  -> sponsored-fee check
  -> adapter
  -> finality
  -> receipt
```

See `docs/OMNICHAIN-RAIL-REGISTRY.md` for the reconciled cross-repository inventory.

## Rail selection criteria

Eligible settlement infrastructure may be evaluated using:

- asset support;
- chain / network support;
- sponsored-fee or fee-abstraction availability;
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

> ATG says what the economic action means. PAYRAIL decides how approved value moves. Settlement adapters move it. Sponsored fees remove user gas friction. Receipts prove it. AGENT-ENTITY records the resulting persistent state.

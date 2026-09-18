# Arc Security Envelope for PAYRAIL

Status: CANONICAL DIRECTION  
Date: 2026-09-18

Arc is a first-class settlement rail beneath AGENTROPOLIS-PAYRAIL.

Arc does not own identity, authority, economic intent, entitlement, treasury policy, or state transitions.

## Execution contract

```text
AGENT-ENTITY
 -> FISCALITH EconomicIntent
 -> Execution Envelope
 -> AEGIS authorization
 -> 54T containment checks
 -> PAYRAIL
 -> Chain Oracle
 -> Arc adapter
 -> transaction execution
 -> Arc finality verification
 -> signed SettlementReceipt
 -> entitlement/state processor
 -> audit
```

## Current Arc capability profile

PAYRAIL should model provider features as adapter metadata and re-discover or revalidate them over time.

Reference snapshot for 2026-09-18:

- public EVM-compatible L1;
- USDC-denominated network fees;
- deterministic sub-second finality;
- Circle-native stablecoin and interoperability integrations;
- agentic commerce and tokenized-asset use cases;
- privacy and cryptographic capabilities that may evolve.

No provider capability bypasses AEGIS or Execution Envelope policy.

## Arc adapter descriptor

```ts
export type ArcRailCapabilities = {
  rail: "arc";
  capabilityVersion: string;
  observedAt: string;
  evmCompatible: boolean;
  gasModes: Array<"stablecoin_native" | "sponsored" | "paymaster">;
  supportedAssets: string[];
  finality: {
    mode: "deterministic" | "probabilistic" | "unknown";
    expectedMs?: number;
  };
  privacy: {
    available: boolean;
    mode?: string;
  };
  crossChain: {
    adapters: string[];
  };
  postQuantum: {
    supported: boolean | "unknown";
    schemes?: string[];
  };
};
```

Unknown capability state is not silently converted to supported.

## Gas policy

Arc currently supports dollar-denominated fees using USDC. Treat this as `stablecoin_native`, not as blanket gas sponsorship.

Systemwide PAYRAIL preference order:

1. sponsored;
2. paymaster / account abstraction;
3. stablecoin-native gas;
4. bounded native-gas fallback.

The ordering may be overridden by policy, cost, security, or rail capability, but native-gas fallback must never be silent.

## EconomicIntent binding

Every Arc request should bind:

```yaml
actor: AGENT-ENTITY:<id>
purpose: <policy-class>
asset: USDC
amount: <bounded>
recipient: <verified-counterparty>
rail: arc
expiry: <short-lived>
idempotency_key: <unique>
intent_hash: <hash>
quote_hash: <hash-or-null>
recipient_hash: <hash>
mandate_hash: <hash>
execution_envelope_id: <id>
aegis_decision_id: <id>
max_total_fee: <bounded>
required_finality: deterministic
```

The adapter must refuse mismatched or expired bindings.

## Replay and concurrency

Required:

- unique idempotency key;
- replay cache / durable replay record;
- nonce or sequence validation where applicable;
- recipient and amount binding;
- quote expiry;
- duplicate-settlement detection;
- explicit retry state;
- no "success" receipt before verified finality.

## Receipt rule

A valid Arc settlement receipt should distinguish:

- requested;
- submitted;
- included;
- final;
- failed;
- reverted;
- unknown.

Only the policy-required final state may trigger entitlement mutation.

## Cross-chain rule

Arc to/from Base, Solana, XRPL, Stellar, Hedera, Robinhood Chain, or future rails must pass PAYRAIL cross-rail conservation checks.

Do not infer destination ownership from a source-chain transaction alone.

## RWA boundary

For tokenized assets:

```text
settlement receipt
 + asset receipt
 + issuer / registry evidence
 + eligibility / jurisdiction checks
 + custody evidence when required
 = entitlement decision
```

PAYRAIL moves governed value. It does not independently declare legal ownership.

## Failure policy

Fail closed on:

- unknown rail profile for a required capability;
- stale capability metadata;
- mismatched chain ID;
- mismatched recipient;
- amount/fee above envelope;
- expired intent;
- replay;
- unverifiable finality;
- policy conflict;
- missing receipt lineage.

## Provider-independence law

If Arc changes, is unavailable, or is replaced, the EconomicIntent and policy contracts remain stable. PAYRAIL may select another eligible rail without changing AGENT-ENTITY, ATG, FISCALITH, or the Execution Envelope.

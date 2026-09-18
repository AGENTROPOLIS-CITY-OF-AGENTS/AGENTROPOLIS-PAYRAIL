# Arc Settlement Integration

Status: guarded reference implementation

Arc is an optional settlement rail beneath AGENTROPOLIS governance. It is not a policy engine, treasury authority, identity system, agent language, financial language, or replacement for PAYRAIL.

## Canonical Corridor

```text
AGENTENTITY
  -> ATRALITH / ATG
  -> FISCALITH financial intent
  -> Execution Envelope
  -> AEGIS authority / risk decision
  -> 54T trust enforcement
  -> PAYRAIL provider / rail selection
  -> Circle App Kit / x402 / direct settlement adapter
  -> external signer / scoped wallet provider
  -> selected rail
  -> settlement receipt + Proof Graph
```

AQUADUCT owns sandbox/testnet proving when a provider, adapter or capability requires certification.

No settlement rail may bypass the corridor.

## Verified Arc Network Metadata

Current official Arc network references publish:

### Arc Mainnet

- chain id: `5042`
- RPC: `https://rpc.mainnet.arc.io`
- native gas token: USDC
- native gas decimals: 18
- explorer: `https://explorer.arc.io`
- PAYRAIL confirmation floor: 1 deterministic-finality confirmation
- compiled profile remains `dryRunByDefault: true`
- live adapter flag remains disabled

### Arc Testnet

- chain id: `5042002`
- RPC: `https://rpc.testnet.arc.io`
- native gas token: USDC
- native gas decimals: 18
- explorer: `https://explorer.testnet.arc.io`
- PAYRAIL confirmation floor: 1 deterministic-finality confirmation

## Activation boundary

Verified network metadata is **not** authorization for live mainnet settlement.

Production activation still requires:
1. external/scoped signer provider;
2. FISCALITH intent and mandate reference;
3. Execution Envelope reference;
4. AEGIS decision reference;
5. 54T intent/signer/capability integrity attestation;
6. replay and concurrency protection;
7. task-bound settlement receipt;
8. operator-controlled live-settlement flag;
9. provider/adapter certification where required.

Until these gates exist, the adapter refuses live settlement.

## Circle App Kit

PAYRAIL may use Circle App Kit as a provider for Send, Bridge, Swap, Unified Balance, Onramp and Earn where supported.

Circle App Kit does not become the router. PAYRAIL remains responsible for provider/rail selection after policy and authority checks.

Runtime provider support SHOULD be discovered dynamically rather than copied into FISCALITH.

## 54T boundary

54T enforces:
- no raw private keys to agents;
- canonical financial-intent binding;
- recipient / amount / asset / fee integrity;
- provider/RPC allowlists;
- quote integrity and expiry;
- capability attenuation;
- egress restrictions;
- replay/idempotency;
- partial-execution recovery safety.

## Bridge recovery

Multi-step Bridge execution may partially succeed. A successful source burn MUST remain recorded if a later attestation or mint step fails.

> **Retry the state, not the money.**

## AGENTENTITY Boundary

PAYRAIL settlement does not itself transfer AGENTENTITY ownership, credentials, private memory or controller state. Entity state transition consumes independently verified settlement evidence.

## Required Invariants

- No agent gets raw wallet power.
- ATRALITH/ATG remains the agent language.
- FISCALITH owns financial semantics.
- Arc is a rail, not the economic brain.
- 54T SAFE does not mean AEGIS-authorized.
- AQUADUCT test success does not grant mainnet authority.
- Settlement success does not silently imply an AGENTENTITY transfer.
- Every consequential economic action emits a receipt.

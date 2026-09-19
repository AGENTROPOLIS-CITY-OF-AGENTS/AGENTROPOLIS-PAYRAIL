# Circle App Kit Production Provider Adapter

Status: implementation contract

## Source-derived package requirements

Install the all-in-one Circle App Kit SDK:

```bash
npm install @circle-fin/app-kit
```

For the initial Arc/EVM implementation, use the Viem adapter:

```bash
npm install @circle-fin/adapter-viem-v2 viem
```

Supported alternatives from Circle documentation include:
- `@circle-fin/adapter-ethers-v6`
- `@circle-fin/adapter-solana-kit`
- `@circle-fin/adapter-circle-wallets`

Circle Wallets is server-side only.

Circle API key requirements:
- Onramp: required.
- Swap: optional, otherwise rate limited.
- Earn: optional, otherwise rate limited.

## PAYRAIL role

PAYRAIL is the production provider/router boundary. It consumes approved FISCALITH intents and maps them to Circle App Kit operations only after AEGIS and Execution Envelope approval.

```text
ATG message
  -> FISCALITH intent
  -> Execution Envelope
  -> AEGIS decision
  -> PAYRAIL provider selection
  -> Circle App Kit adapter
  -> Arc / supported chain
  -> normalized settlement evidence
```

PAYRAIL may route approved operations to Circle App Kit.

## Capability mapping

| FISCALITH | Circle App Kit |
| --- | --- |
| SEND / PAY | Send |
| BRIDGE | Bridge |
| SWAP | Swap |
| UNIFIED_BALANCE | Unified Balance |
| ONRAMP | Onramp |
| EARN | Earn |

## Rules

- provider support is discovered dynamically when possible;
- application/custom fees are explicit financial semantics;
- estimate before execute when the provider supports estimates;
- signer credentials never enter agent prompts or receipts;
- raw-key provider adapters are not a production agent path;
- unsupported gas sponsorship is an explicit route constraint;
- provider errors preserve partial financial state for recovery;
- crosschain pending is not settlement;
- provider selection cannot bypass AEGIS or 54T.

## Security boundary

- Never place Circle API keys in client-side code.
- Never serialize wallet credentials into ATG or FISCALITH messages.
- Never expose Circle Wallets credentials to the browser.
- Use capability-scoped secret handles.
- Preserve gas-sponsorship-first policy where supported.
- Production calls require task-bound approval and receipt references.
- Provider success must be independently normalized into PAYRAIL receipt evidence.

## Certification

Material Circle App Kit adapter changes SHOULD be re-proven through AQUADUCT and consumed by the Forge before production eligibility changes.
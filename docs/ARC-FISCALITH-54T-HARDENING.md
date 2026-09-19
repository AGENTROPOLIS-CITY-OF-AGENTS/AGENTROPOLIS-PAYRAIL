# Arc / FISCALITH / 54T Hardening

Status: implemented (guarded, non-settling)
Branch: `feat/arc-fiscalith-54t-hardening`

This change hardens AGENTROPOLIS-PAYRAIL's money handling, settlement result
shapes, signed-intent binding, replay protection, and RPC/secret hygiene. It
does NOT enable any live settlement.

## 1. Integer-safe money (no floating point)

Floating-point arithmetic is forbidden for money. `payrail-core/src/money.ts`
introduces integer minor-unit (bigint) representation with an explicit decimal
scale:

- `Money` discriminated union: `{ asset, kind, decimals, minorUnits }`
- `parseDecimalToMinorUnits` / `formatMinorUnits` — no floats
- `addMoney` / `subMoney` / `compareMoney` — integer-only, refuse mixed scales
- `legacyUsdcToMinorUnits` — bridge for existing float callers (deprecated)

`UsdcAmount` (float) is retained only for backward compatibility and marked
DEPRECATED.

## 2. Arc native USDC (18) vs ERC-20 USDC (6) — explicit separation

Two USDC representations are structurally distinct and cannot be silently mixed:

- ERC-20 USDC: 6 decimals (`USDC_ERC20_DECIMALS`)
- Arc native USDC: 18 decimals (`ARC_NATIVE_USDC_DECIMALS`)

`usdcToArcNative` (×10^12) and `arcNativeToUsdc` (÷10^12, refuses sub-6-decimal
precision loss) are the only conversion paths, and they are explicit. Arithmetic
helpers throw if scales are mixed.

## 3. Unambiguous settlement result shapes

The ambiguous `success: boolean` shape is replaced by a discriminated union
(`payrail-core/src/status.ts`):

- `SIMULATED` — dry-run / mock. **Never carries a txHash** (type-enforced).
- `PENDING` — submitted, awaiting confirmation. May carry a txHash.
- `SETTLED` — finality confirmed. Carries a txHash.
- `BLOCKED` — refused by policy / authority / integrity. No txHash.
- `FAILED` — execution failed. No txHash.

Adapters (x402, Arc, Monero), the receipt engine, and the gateway `/pay`
endpoint all use this vocabulary.

## 4. Simulated results never include a txHash

The `SIMULATED` variant has no `txHash` field at all, so a simulated result
cannot carry one. Tests assert this for every adapter.

## 5. Replay / idempotency scaffolding

`payrail-core/src/replay.ts` provides an in-memory `ReplayGuard`:

- unique `idempotencyKey` per settlement;
- duplicate key detection (refused);
- `recordIfAbsent` for idempotent retries (returns the original outcome);
- no "success" receipt before verified finality.

⚠️ **NON-DURABLE / NOT PRODUCTION COMPLETE.** The guard resets on restart.
Phase 1 must replace it with a persistent store before any live settlement.

## 6. SignedIntent binding

`payrail-core/src/signed-intent.ts` binds every field that determines what
value moves and under what authority:

actor, mandate, amount, asset, recipient, chain, provider, fee policy, quote,
expiry, Execution Envelope, AEGIS decision, 54T attestation.

`validateSignedIntentBindings` rejects incomplete/inconsistent intents;
`verifySignedIntentBinding` detects mismatches against expected references.
The Arc adapter refuses any intent whose binding is invalid or mismatched.

## 7. RPC / provider integrity + secret redaction

- `payrail-core/src/rpc-integrity.ts`: `verifyRpcIntegrity` fails closed on
  non-https, embedded credentials, non-allowlisted hosts, and invalid chainId.
  `verifyChainId` confirms the reported chain matches the expected chain.
- `payrail-core/src/redact.ts`: `redactSecrets` / `redactObject` scrub wallet
  keys, RPC tokens, seed phrases, bearer tokens, PEM private keys, and
  credential-bearing URLs from logs, receipts, and error messages.

## 8. Tests

Each package gained a `test/` suite using the established greenrails pattern
(`tsc -p test/tsconfig.json` + `node --test` with explicit file paths):

- payrail-core: 51 tests (money, status, signed-intent, replay, redact, rpc-integrity)
- x402-adapter: 8 tests (outcome shapes, no-txHash-on-simulated, signedIntent, replay)
- receipt-engine: 6 tests (status vocabulary, no-txHash-on-simulated)
- wallet-guard: 6 tests (minor-unit limits, BLOCKED/PENDING)
- monero-adapter: 5 tests (outcome shapes, secret rejection)

## 9. What is NOT enabled

- Arc mainnet execution remains disabled (`enabled: false`).
- No wallet keys, RPC tokens, secrets, or credentials are introduced.
- AEGIS / 54T / FISCALITH ownership boundaries are unchanged.

## Remaining Phase-2 work

- external/scoped signer implementation;
- 54T runtime binding to PAYRAIL execution;
- durable replay/idempotency store (replaces in-memory ReplayGuard);
- receipt-engine rail/intent binding;
- Arc/Circle App Kit E2E certification;
- operator-controlled live enablement.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseUsdc,
  type SignedIntent,
  validateSignedIntentBindings,
  isSignedIntentValid,
  verifySignedIntentBinding,
  SIGNED_INTENT_BINDING_KEYS,
} from "../src/index.js";

const NOW = Date.now();
const ISO = (ms: number) => new Date(ms).toISOString();

function validIntent(overrides: Partial<SignedIntent["bindings"]> = {}): SignedIntent {
  const bindings: SignedIntent["bindings"] = {
    actor: "AGENT-ENTITY:whale-watcher-54",
    mandate: "mandate-001",
    amount: parseUsdc("0.05"),
    asset: "USDC",
    recipient: "0xRecipientAddress0000000000000000000000000001",
    chain: "arc-testnet",
    provider: "arc",
    feePolicy: { feePolicyId: "fp-001", maxTotalFeeMinorUnits: 1000n },
    quote: {
      quoteId: "q-001",
      quoteHash: "0xquotehash",
      amountMinorUnits: 50000n,
      expiresAt: ISO(NOW + 60_000),
    },
    expiry: ISO(NOW + 60_000),
    executionEnvelope: { id: "env-001" },
    aegisDecision: { id: "aegis-001" },
    attestation54t: { id: "att-001" },
    ...overrides,
  };
  return { version: 1, intentId: "intent-001", bindings };
}

test("a fully-bound signed intent is valid", () => {
  const intent = validIntent();
  assert.deepEqual(validateSignedIntentBindings(intent), []);
  assert.ok(isSignedIntentValid(intent));
});

test("all 13 required binding keys are present in the contract", () => {
  assert.deepEqual(SIGNED_INTENT_BINDING_KEYS, [
    "actor",
    "mandate",
    "amount",
    "asset",
    "recipient",
    "chain",
    "provider",
    "feePolicy",
    "quote",
    "expiry",
    "executionEnvelope",
    "aegisDecision",
    "attestation54t",
  ]);
});

test("missing actor is rejected", () => {
  const intent = validIntent({ actor: "" });
  assert.ok(validateSignedIntentBindings(intent).includes("actor is required"));
  assert.ok(!isSignedIntentValid(intent));
});

test("missing Execution Envelope / AEGIS / 54T references are rejected", () => {
  const intent = validIntent({ executionEnvelope: { id: "" } });
  const problems = validateSignedIntentBindings(intent);
  assert.ok(problems.includes("executionEnvelope.id is required"));
  assert.ok(!isSignedIntentValid(intent));
});

test("quote amount must match intent amount", () => {
  const intent = validIntent({
    quote: {
      quoteId: "q-001",
      quoteHash: "0xquotehash",
      amountMinorUnits: 99999n, // mismatch
      expiresAt: ISO(NOW + 60_000),
    },
  });
  const problems = validateSignedIntentBindings(intent);
  assert.ok(problems.some((p) => p.includes("quote.amountMinorUnits does not match")));
});

test("expired intent is rejected", () => {
  const intent = validIntent({ expiry: ISO(NOW - 60_000) });
  assert.ok(validateSignedIntentBindings(intent).includes("expiry is in the past"));
});

test("verifySignedIntentBinding detects a mismatched recipient", () => {
  const intent = validIntent();
  const mismatches = verifySignedIntentBinding(intent, {
    recipient: "0xDifferentRecipient0000000000000000000000000002",
  });
  assert.deepEqual(mismatches, ["recipient"]);
});

test("verifySignedIntentBinding passes when all expected refs match", () => {
  const intent = validIntent();
  const mismatches = verifySignedIntentBinding(intent, {
    actor: "AGENT-ENTITY:whale-watcher-54",
    recipient: "0xRecipientAddress0000000000000000000000000001",
    chain: "arc-testnet",
    provider: "arc",
    executionEnvelope: { id: "env-001" },
    aegisDecision: { id: "aegis-001" },
    attestation54t: { id: "att-001" },
  });
  assert.deepEqual(mismatches, []);
});

test("verifySignedIntentBinding detects multiple mismatches", () => {
  const intent = validIntent();
  const mismatches = verifySignedIntentBinding(intent, {
    actor: "wrong-actor",
    chain: "base",
    provider: "x402",
  });
  assert.deepEqual(mismatches.sort(), ["actor", "chain", "provider"].sort());
});

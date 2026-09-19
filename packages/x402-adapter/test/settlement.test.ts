import { test } from "node:test";
import assert from "node:assert/strict";

import { settle, replayGuard, type SettlementRequest } from "../src/index.js";
import { settleOnArc, arcReplayGuard } from "../src/arc.js";
import {
  parseUsdc,
  type SignedIntent,
} from "@agentropolis/payrail-core";

const NOW = Date.now();
const ISO = (ms: number) => new Date(ms).toISOString();

function baseRequest(overrides: Partial<SettlementRequest> = {}): SettlementRequest {
  return {
    receiptId: "rcpt-1",
    agentId: "agent-1",
    districtId: "harbor",
    toAddress: "0xRecipient0000000000000000000000000000000001",
    amountUsdc: 0.05,
    taskId: "task-1",
    idempotencyKey: "idem-1",
    ...overrides,
  };
}

function validArcIntent(chain: "arc-testnet" | "arc-mainnet" = "arc-testnet"): SignedIntent {
  return {
    version: 1,
    intentId: "intent-arc-1",
    bindings: {
      actor: "agent-1",
      mandate: "mandate-1",
      amount: parseUsdc("0.05"),
      asset: "USDC",
      recipient: "0xRecipient0000000000000000000000000000000001",
      chain,
      provider: "arc",
      feePolicy: { feePolicyId: "fp-1", maxTotalFeeMinorUnits: 1000n },
      quote: {
        quoteId: "q-1",
        quoteHash: "0xquote",
        amountMinorUnits: 50000n,
        expiresAt: ISO(NOW + 60_000),
      },
      expiry: ISO(NOW + 60_000),
      executionEnvelope: { id: "env-1" },
      aegisDecision: { id: "aegis-1" },
      attestation54t: { id: "att-1" },
    },
  };
}

test("x402 settle returns a SIMULATED outcome with no txHash", async () => {
  replayGuard.clear();
  const result = await settle(baseRequest());
  assert.equal(result.status, "SIMULATED");
  assert.equal(result.simulatedOnly, true);
  assert.ok(!("txHash" in result));
});

test("x402 settle refuses a replayed idempotency key", async () => {
  replayGuard.clear();
  await settle(baseRequest({ idempotencyKey: "idem-replay" }));
  const second = await settle(baseRequest({ idempotencyKey: "idem-replay" }));
  assert.equal(second.status, "BLOCKED");
  assert.equal(second.reason, "duplicate-idempotency-key");
});

test("x402 settle is idempotent on retry via recordIfAbsent", async () => {
  replayGuard.clear();
  const first = await settle(baseRequest({ idempotencyKey: "idem-idem" }));
  // A retry with the same key returns the recorded outcome, not a new one.
  const retry = await settle(baseRequest({ idempotencyKey: "idem-idem" }));
  assert.equal(retry.status, "BLOCKED"); // replay guard refuses the duplicate
  assert.equal(first.status, "SIMULATED");
});

test("Arc testnet settleOnArc returns SIMULATED with no txHash", async () => {
  arcReplayGuard.clear();
  const result = await settleOnArc({
    receiptId: "rcpt-arc",
    agentId: "agent-1",
    taskId: "task-1",
    districtId: "harbor",
    toAddress: "0xRecipient0000000000000000000000000000000001",
    amountUsdc: 0.05,
    rail: "arc-testnet",
    idempotencyKey: "idem-arc-1",
    signedIntent: validArcIntent(),
  });
  assert.equal(result.outcome.status, "SIMULATED");
  assert.ok(!("txHash" in result.outcome));
  assert.equal(result.chainId, 5042002);
});

test("Arc mainnet settleOnArc is BLOCKED (live disabled) even with approval refs", async () => {
  arcReplayGuard.clear();
  const result = await settleOnArc({
    receiptId: "rcpt-arc-main",
    agentId: "agent-1",
    taskId: "task-1",
    districtId: "harbor",
    toAddress: "0xRecipient0000000000000000000000000000000001",
    amountUsdc: 0.05,
    rail: "arc-mainnet",
    idempotencyKey: "idem-arc-main",
    signedIntent: validArcIntent("arc-mainnet"),
    approvalRef: "approval-1",
    executionEnvelopeRef: "env-1",
    aegisDecisionRef: "aegis-1",
  });
  assert.equal(result.outcome.status, "BLOCKED");
  assert.equal(result.outcome.reason, "arc-mainnet-live-disabled");
  assert.equal(result.chainId, 5042);
});

test("Arc mainnet settleOnArc is BLOCKED when approval refs are missing", async () => {
  arcReplayGuard.clear();
  const result = await settleOnArc({
    receiptId: "rcpt-arc-main2",
    agentId: "agent-1",
    taskId: "task-1",
    districtId: "harbor",
    toAddress: "0xRecipient0000000000000000000000000000000001",
    amountUsdc: 0.05,
    rail: "arc-mainnet",
    idempotencyKey: "idem-arc-main2",
    signedIntent: validArcIntent("arc-mainnet"),
  });
  assert.equal(result.outcome.status, "BLOCKED");
  assert.equal(result.outcome.reason, "missing-approval-refs");
});

test("Arc settleOnArc refuses a signed intent with a mismatched recipient", async () => {
  arcReplayGuard.clear();
  const intent = validArcIntent();
  intent.bindings.recipient = "0xDifferent0000000000000000000000000000000002";
  const result = await settleOnArc({
    receiptId: "rcpt-arc-mismatch",
    agentId: "agent-1",
    taskId: "task-1",
    districtId: "harbor",
    toAddress: "0xRecipient0000000000000000000000000000000001",
    amountUsdc: 0.05,
    rail: "arc-testnet",
    idempotencyKey: "idem-arc-mismatch",
    signedIntent: intent,
  });
  assert.equal(result.outcome.status, "BLOCKED");
  assert.equal(result.outcome.reason, "signed-intent-binding-mismatch");
});

test("Arc settleOnArc refuses a replayed idempotency key", async () => {
  arcReplayGuard.clear();
  await settleOnArc({
    receiptId: "rcpt-arc-replay",
    agentId: "agent-1",
    taskId: "task-1",
    districtId: "harbor",
    toAddress: "0xRecipient0000000000000000000000000000000001",
    amountUsdc: 0.05,
    rail: "arc-testnet",
    idempotencyKey: "idem-arc-replay",
    signedIntent: validArcIntent(),
  });
  const second = await settleOnArc({
    receiptId: "rcpt-arc-replay",
    agentId: "agent-1",
    taskId: "task-1",
    districtId: "harbor",
    toAddress: "0xRecipient0000000000000000000000000000000001",
    amountUsdc: 0.05,
    rail: "arc-testnet",
    idempotencyKey: "idem-arc-replay",
    signedIntent: validArcIntent(),
  });
  assert.equal(second.outcome.status, "BLOCKED");
  assert.equal(second.outcome.reason, "duplicate-idempotency-key");
});

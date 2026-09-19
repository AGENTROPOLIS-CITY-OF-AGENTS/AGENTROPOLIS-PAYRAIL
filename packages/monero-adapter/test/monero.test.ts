import { test } from "node:test";
import assert from "node:assert/strict";

import { simulateMoneroSettlement, type MoneroSettlementRequest } from "../src/index.js";

function baseRequest(overrides: Partial<MoneroSettlementRequest> = {}): MoneroSettlementRequest {
  return {
    intentId: "intent-1",
    mandateId: "mandate-1",
    mandateVersion: 1,
    agentId: "agent-1",
    districtId: "harbor",
    destination: "monero-address",
    amountXmr: "0.5",
    idempotencyKey: "idem-1",
    privacyDecision: "approved",
    privacyPolicyId: "hush54",
    disclosureProfile: "principal-only",
    dryRun: true,
    ...overrides,
  };
}

test("approved privacy decision returns SIMULATED with no txId", async () => {
  const result = await simulateMoneroSettlement(baseRequest());
  assert.equal(result.outcome.status, "SIMULATED");
  assert.equal(result.txId, null);
  assert.ok(!("txId" in result.outcome));
});

test("denied privacy decision returns BLOCKED", async () => {
  const result = await simulateMoneroSettlement(baseRequest({ privacyDecision: "denied" }));
  assert.equal(result.outcome.status, "BLOCKED");
  assert.equal(result.outcome.reason, "privacy-policy-denied");
});

test("approval-required privacy decision returns FAILED", async () => {
  const result = await simulateMoneroSettlement(
    baseRequest({ privacyDecision: "approval-required" }),
  );
  assert.equal(result.outcome.status, "FAILED");
  assert.equal(result.outcome.reason, "approval-required");
});

test("secret material in the request is rejected", async () => {
  const withSecret = {
    ...baseRequest(),
    seedPhrase: "abandon abandon abandon",
  } as unknown as MoneroSettlementRequest;
  await assert.rejects(simulateMoneroSettlement(withSecret));
});

test("non-dry-run is rejected", async () => {
  await assert.rejects(
    simulateMoneroSettlement(baseRequest({ dryRun: false } as never)),
  );
});

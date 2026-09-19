import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluatePolicy, type WalletGuardPolicy } from "../src/index.js";
import type { PaymentRequest } from "@agentropolis/payrail-core";

function baseRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    agentId: "agent-1" as never,
    districtId: "harbor" as never,
    taskId: "task-1" as never,
    taskType: "whale-alert",
    amountUsdc: 0.05,
    description: "test",
    dryRun: false,
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}

function basePolicy(overrides: Partial<WalletGuardPolicy> = {}): WalletGuardPolicy {
  return {
    policyId: "policy-1",
    agentId: "agent-1",
    maxSpendPerTaskUsdc: 0.1,
    maxSpendPerDayUsdc: 1.0,
    approvalThresholdUsdc: 0.05,
    allowedDistricts: ["*"],
    blockedDistricts: ["dark-alley"],
    dryRun: false,
    ...overrides,
  };
}

test("dry-run policy returns SIMULATED", () => {
  const decision = evaluatePolicy(baseRequest(), basePolicy({ dryRun: true }));
  assert.equal(decision.status, "SIMULATED");
  assert.equal(decision.allowed, true);
});

test("blocked district returns BLOCKED", () => {
  const decision = evaluatePolicy(
    baseRequest({ districtId: "dark-alley" as never }),
    basePolicy(),
  );
  assert.equal(decision.status, "BLOCKED");
  assert.equal(decision.allowed, false);
});

test("amount above approval threshold returns PENDING (approval required)", () => {
  const decision = evaluatePolicy(
    baseRequest({ amountUsdc: 0.05 }),
    basePolicy({ approvalThresholdUsdc: 0.05 }),
  );
  assert.equal(decision.status, "PENDING");
  assert.equal(decision.requiresApproval, true);
});

test("amount within limits returns PENDING (approved, awaiting settlement)", () => {
  const decision = evaluatePolicy(
    baseRequest({ amountUsdc: 0.01 }),
    basePolicy({ approvalThresholdUsdc: 0.05 }),
  );
  assert.equal(decision.status, "PENDING");
  assert.equal(decision.allowed, true);
  assert.equal(decision.requiresApproval, false);
});

test("per-task limit in integer minor units blocks correctly", () => {
  const decision = evaluatePolicy(
    baseRequest({ amountUsdc: 0.2 }),
    basePolicy({ maxSpendPerTaskMinorUnits: 100000n }), // $0.10
  );
  assert.equal(decision.status, "BLOCKED");
  assert.equal(decision.allowed, false);
});

test("approval threshold in integer minor units triggers PENDING", () => {
  const decision = evaluatePolicy(
    baseRequest({ amountUsdc: 0.05 }),
    basePolicy({ approvalThresholdMinorUnits: 50000n }), // $0.05
  );
  assert.equal(decision.status, "PENDING");
  assert.equal(decision.requiresApproval, true);
});

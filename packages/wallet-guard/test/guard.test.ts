import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluatePolicy, type WalletGuardPolicy } from "../src/index.js";
import {
  usdcMinorUnitString,
  type PaymentRequest,
} from "@agentropolis/payrail-core";

function baseRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    agentId: "agent-1" as never,
    districtId: "harbor" as never,
    taskId: "task-1" as never,
    taskType: "whale-alert",
    amountMinorUnits: usdcMinorUnitString("50000"),
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
    maxSpendPerTaskMinorUnits: usdcMinorUnitString("100000"),
    maxSpendPerDayMinorUnits: usdcMinorUnitString("1000000"),
    approvalThresholdMinorUnits: usdcMinorUnitString("50000"),
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

test("amount at approval threshold requires approval", () => {
  const decision = evaluatePolicy(baseRequest(), basePolicy());
  assert.equal(decision.status, "PENDING");
  assert.equal(decision.requiresApproval, true);
});

test("amount within limits returns PENDING without approval", () => {
  const decision = evaluatePolicy(
    baseRequest({ amountMinorUnits: usdcMinorUnitString("10000") }),
    basePolicy(),
  );
  assert.equal(decision.status, "PENDING");
  assert.equal(decision.allowed, true);
  assert.equal(decision.requiresApproval, false);
});

test("per-task integer limit blocks exactly", () => {
  const decision = evaluatePolicy(
    baseRequest({ amountMinorUnits: usdcMinorUnitString("100001") }),
    basePolicy(),
  );
  assert.equal(decision.status, "BLOCKED");
  assert.equal(decision.allowed, false);
});

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  simulatedOutcome,
  pendingOutcome,
  settledOutcome,
  blockedOutcome,
  failedOutcome,
  isSimulated,
  hasTxHash,
  getTxHash,
  type SettlementOutcome,
} from "../src/status.js";

test("SIMULATED outcome never carries a txHash (type + runtime)", () => {
  const outcome = simulatedOutcome("dry run");
  assert.equal(outcome.status, "SIMULATED");
  assert.equal(outcome.simulatedOnly, true);
  // The SIMULATED variant has no txHash field at all.
  assert.ok(!("txHash" in outcome));
  assert.equal(getTxHash(outcome), undefined);
  assert.ok(isSimulated(outcome));
  assert.ok(!hasTxHash(outcome));
});

test("SETTLED outcome carries a txHash", () => {
  const outcome = settledOutcome("settled", "0xabc123");
  assert.equal(outcome.status, "SETTLED");
  assert.equal(outcome.txHash, "0xabc123");
  assert.equal(getTxHash(outcome), "0xabc123");
  assert.ok(hasTxHash(outcome));
  assert.ok(!isSimulated(outcome));
});

test("PENDING outcome may carry a txHash", () => {
  const outcome = pendingOutcome("submitted", "0xdef456");
  assert.equal(outcome.status, "PENDING");
  assert.equal(getTxHash(outcome), "0xdef456");
  assert.ok(hasTxHash(outcome));
});

test("BLOCKED and FAILED outcomes carry no txHash", () => {
  const blocked = blockedOutcome("denied", "policy");
  const failed = failedOutcome("failed", "execution");
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(failed.status, "FAILED");
  assert.ok(!("txHash" in blocked));
  assert.ok(!("txHash" in failed));
  assert.equal(getTxHash(blocked), undefined);
  assert.equal(getTxHash(failed), undefined);
  assert.ok(!hasTxHash(blocked));
  assert.ok(!hasTxHash(failed));
});

test("all five canonical statuses are distinct", () => {
  const statuses = [
    simulatedOutcome("a").status,
    pendingOutcome("b").status,
    settledOutcome("c", "0x1").status,
    blockedOutcome("d", "e").status,
    failedOutcome("f", "g").status,
  ];
  assert.deepEqual(statuses, ["SIMULATED", "PENDING", "SETTLED", "BLOCKED", "FAILED"]);
  assert.equal(new Set(statuses).size, 5);
});

test("discriminated union narrows correctly", () => {
  const outcomes: SettlementOutcome[] = [
    simulatedOutcome("a"),
    settledOutcome("b", "0x1"),
  ];
  for (const o of outcomes) {
    if (o.status === "SETTLED") {
      assert.equal(typeof o.txHash, "string");
    } else {
      assert.ok(!("txHash" in o));
    }
  }
});

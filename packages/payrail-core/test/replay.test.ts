import { test } from "node:test";
import assert from "node:assert/strict";

import { ReplayGuard, simulatedOutcome, settledOutcome } from "../src/index.js";

test("ReplayGuard is explicitly NON-DURABLE / NOT PRODUCTION COMPLETE", () => {
  const guard = new ReplayGuard();
  assert.equal(guard.durable, false);
  assert.equal(guard.nonDurable, true);
  assert.equal(guard.productionComplete, false);
});

test("a fresh key is not a replay", () => {
  const guard = new ReplayGuard();
  assert.equal(guard.isReplay("key-1"), false);
  assert.equal(guard.lookup("key-1"), undefined);
});

test("recording a key then re-checking detects a replay", () => {
  const guard = new ReplayGuard();
  guard.record("key-1", simulatedOutcome("sim"));
  assert.equal(guard.isReplay("key-1"), true);
  assert.equal(guard.size, 1);
});

test("recording the same key twice throws (duplicate detected)", () => {
  const guard = new ReplayGuard();
  guard.record("key-1", simulatedOutcome("sim"));
  assert.throws(() => guard.record("key-1", simulatedOutcome("sim2")));
});

test("recordIfAbsent is idempotent: a retried key returns the original outcome", () => {
  const guard = new ReplayGuard();
  const first = guard.recordIfAbsent("key-1", simulatedOutcome("original"));
  const retry = guard.recordIfAbsent("key-1", settledOutcome("should-not-win", "0x1"));
  assert.equal(retry, first);
  assert.equal(retry.outcome.status, "SIMULATED");
  assert.equal(guard.size, 1);
});

test("clear resets the guard", () => {
  const guard = new ReplayGuard();
  guard.record("key-1", simulatedOutcome("sim"));
  guard.clear();
  assert.equal(guard.size, 0);
  assert.equal(guard.isReplay("key-1"), false);
});

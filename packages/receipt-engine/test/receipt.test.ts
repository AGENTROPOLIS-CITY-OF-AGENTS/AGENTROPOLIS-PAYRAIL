import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createReceipt,
  markSettled,
  getReceipt,
  type CreateReceiptInput,
} from "../src/index.js";
import { usdcMinorUnitString } from "@agentropolis/payrail-core";

function baseInput(overrides: Partial<CreateReceiptInput> = {}): CreateReceiptInput {
  return {
    taskId: "task-1" as never,
    agentId: "agent-1" as never,
    districtId: "harbor" as never,
    taskType: "whale-alert",
    description: "test",
    amountMinorUnits: usdcMinorUnitString("50000"),
    status: "SIMULATED",
    dryRun: true,
    ...overrides,
  };
}

test("a SIMULATED receipt carries no txHash", () => {
  const receipt = createReceipt(baseInput({ status: "SIMULATED" }));
  assert.equal(receipt.status, "SIMULATED");
  assert.equal(receipt.settlement, null);
  assert.ok(!("txHash" in receipt));
});

test("a receipt created with a settlement object preserves it", () => {
  const receipt = createReceipt(
    baseInput({
      status: "SETTLED",
      settlement: { status: "SETTLED", txHash: "0xabc", settledAt: "2026-01-01T00:00:00Z" },
    }),
  );
  assert.equal(receipt.status, "SETTLED");
  assert.equal(receipt.settlement?.txHash, "0xabc");
});

test("markSettled transitions a receipt to SETTLED with a txHash", () => {
  const receipt = createReceipt(baseInput({ status: "PENDING" }));
  const settled = markSettled(receipt.receiptId, "0xdef456");
  assert.equal(settled.status, "SETTLED");
  assert.equal(settled.settlement?.status, "SETTLED");
  assert.equal(settled.settlement?.txHash, "0xdef456");
  assert.ok(settled.settlement?.settledAt);
});

test("markSettled on a missing receipt throws", () => {
  assert.throws(() => markSettled("rcpt_missing" as never, "0x1"));
});

test("getReceipt returns the stored receipt", () => {
  const receipt = createReceipt(baseInput());
  assert.equal(getReceipt(receipt.receiptId)?.receiptId, receipt.receiptId);
});

test("receipt status uses the canonical vocabulary", () => {
  for (const status of ["SIMULATED", "PENDING", "SETTLED", "BLOCKED", "FAILED", "CANCELLED"]) {
    const receipt = createReceipt(baseInput({ status: status as never }));
    assert.equal(receipt.status, status);
  }
});

test("receipt creation rejects contradictory settlement evidence", () => {
  assert.throws(
    () =>
      createReceipt(
        baseInput({
          status: "SIMULATED",
          settlement: {
            status: "SETTLED",
            txHash: "0xabc",
            settledAt: "2026-01-01T00:00:00Z",
          },
        }),
      ),
    /does not match/,
  );

  assert.throws(
    () => createReceipt(baseInput({ status: "SETTLED", settlement: undefined })),
    /requires settlement evidence/,
  );
});

test("SETTLED receipt rejects empty transaction evidence", () => {
  assert.throws(
    () =>
      createReceipt(
        baseInput({
          status: "SETTLED",
          settlement: {
            status: "SETTLED",
            txHash: "",
            settledAt: "2026-01-01T00:00:00Z",
          },
        }),
      ),
    /non-empty txHash/,
  );
});

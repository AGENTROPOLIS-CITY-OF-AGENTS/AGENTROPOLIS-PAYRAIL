import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createReceipt,
  markSettled,
  getReceipt,
  RECEIPT_SCHEMA_VERSION,
  type CreateReceiptInput,
} from "../src/index.js";
import { usdcMinorUnitString } from "@agentropolis/payrail-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    const settlement =
      status === "SETTLED"
        ? { status: "SETTLED" as never, txHash: "0xsettled", settledAt: "2026-01-01T00:00:00Z" }
        : undefined;
    const receipt = createReceipt(baseInput({ status: status as never, settlement }));
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

test("receipt schema version is 2.0.0 and creates receipts carry it", () => {
  assert.equal(RECEIPT_SCHEMA_VERSION, "2.0.0");
  const receipt = createReceipt(baseInput());
  assert.equal(receipt.schemaVersion, "2.0.0");
});

test("created receipts reflect schema version 2.0.0 for all statuses", () => {
  for (const status of ["SIMULATED", "PENDING", "SETTLED", "BLOCKED", "FAILED", "CANCELLED"]) {
    const settlement =
      status === "SETTLED"
        ? { status: "SETTLED" as never, txHash: "0xsettled", settledAt: "2026-01-01T00:00:00Z" }
        : undefined;
    const receipt = createReceipt(baseInput({ status: status as never, settlement }));
    assert.equal(receipt.schemaVersion, "2.0.0");
  }
});

test("schema contract distinguishes v2 from old v1 shape (amountUsdc vs amountMinorUnits)", () => {
  const schemaPath = join(__dirname, "..", "..", "..", "src", "schemas", "receipt.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };

  // v2 pins the exact version and only permits the integer minor-unit amount field.
  const schemaVersionProp = schema.properties.schemaVersion as { const?: string };
  assert.equal(schemaVersionProp.const, "2.0.0");
  assert.ok(schema.properties.amountMinorUnits, "v2 requires amountMinorUnits");
  // Old v1 amount representation (numeric USDC) must not be a permitted property.
  assert.ok(!("amountUsdc" in schema.properties), "old v1 amountUsdc field must be removed from the v2 schema");
  assert.equal(schema.additionalProperties, false, "v2 schema must be closed (additionalProperties: false)");
  assert.ok(schema.required!.includes("amountMinorUnits"), "v2 requires amountMinorUnits");
});

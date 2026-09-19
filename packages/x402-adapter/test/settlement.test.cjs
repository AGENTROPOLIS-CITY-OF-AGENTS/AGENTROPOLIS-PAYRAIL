const test = require("node:test");
const assert = require("node:assert/strict");
const { parseUsdc } = require("../../payrail-core/dist/index.js");
const {
  SettlementExecutionBlockedError,
  executeSettlement,
  executeSettlementOnArc,
  settle,
  settleOnArc,
  verifySettlement,
} = require("../dist/index.js");

const baseRequest = {
  receiptId: "rcpt_test",
  agentId: "agent_test",
  districtId: "test",
  toAddress: "0x0000000000000000000000000000000000000001",
  amountUsdc: parseUsdc("0.1"),
  taskId: "task_test",
};

test("generic settle is simulated and cannot resemble execution", async () => {
  const result = await settle(baseRequest);
  assert.equal(result.kind, "simulated");
  assert.equal(result.executionMode, "simulated");
  assert.match(result.message, /^\[SIMULATED\]/);
  assert.equal("success" in result, false);
  assert.equal("txHash" in result, false);
});

test("Arc testnet path is unmistakably simulated", async () => {
  const result = await settleOnArc({ ...baseRequest, rail: "arc-testnet" });
  assert.equal(result.kind, "simulated");
  assert.equal(result.executionMode, "simulated");
  assert.equal(result.chainId, 5042002);
  assert.equal("txHash" in result, false);
});

test("Arc mainnet blocks when authority refs are missing", async () => {
  await assert.rejects(
    () => settleOnArc({ ...baseRequest, rail: "arc-mainnet" }),
    SettlementExecutionBlockedError,
  );
});

test("Arc mainnet remains blocked even with refs and signed intent", async () => {
  await assert.rejects(
    () =>
      executeSettlementOnArc({
        ...baseRequest,
        rail: "arc-mainnet",
        signedIntent: "opaque-test-intent",
        approvalRef: "approval:test",
        executionEnvelopeRef: "envelope:test",
        aegisDecisionRef: "aegis:test",
      }),
    /live settlement remains disabled/i,
  );
});

test("generic executeSettlement fails closed without refs", async () => {
  await assert.rejects(
    () => executeSettlement(baseRequest),
    SettlementExecutionBlockedError,
  );
});

test("generic executeSettlement remains blocked with refs", async () => {
  await assert.rejects(
    () =>
      executeSettlement({
        ...baseRequest,
        signedIntent: "opaque-test-intent",
        approvalRef: "approval:test",
        executionEnvelopeRef: "envelope:test",
        aegisDecisionRef: "aegis:test",
      }),
    /Live x402 settlement is disabled/i,
  );
});

test("verifySettlement remains unconfirmed-until-live", async () => {
  assert.equal(await verifySettlement("0xdeadbeef"), false);
});

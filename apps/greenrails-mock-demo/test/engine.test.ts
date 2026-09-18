import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { InvariantViolation, MockSettlementEngine } from "../src/engine.js";
import { buildReceipt, canonicalJson, verifyReceipt } from "../src/receipt.js";
import { SCENARIOS, baseQuote } from "../src/scenarios.js";
import { ALLOWED_TRANSITIONS, LIVE_FUNDS_ENABLED, MOCK_BANNER, SUCCESS_PATH, TERMINAL_STATES } from "../src/states.js";

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("LIVE_FUNDS_ENABLED is hard-coded false", () => {
  assert.equal(LIVE_FUNDS_ENABLED, false);
  assert.equal(new MockSettlementEngine().liveFundsEnabled, false);
});

test("banner text is exact", () => {
  assert.equal(MOCK_BANNER, "MOCK SETTLEMENT · NO FUNDS WILL MOVE");
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, "..", "..", "public", "index.html"), "utf8");
  assert.ok(html.includes("MOCK SETTLEMENT · NO FUNDS WILL MOVE"));
  assert.ok(html.includes("Demonstration only. No financial product is offered."));
});

test("canonical state names", () => {
  assert.deepEqual([...SUCCESS_PATH], [
    "QUOTED", "USDC_RESERVED", "INPUT_AUTHORIZED", "XENTS_ROUTED", "NFT_TRANSFER_PENDING",
    "NFT_TRANSFER_CONFIRMED", "USDC_RELEASED", "RECEIPT_FINALIZED",
  ]);
  assert.deepEqual([...TERMINAL_STATES], [
    "QUOTE_EXPIRED", "INPUT_FAILED", "INSUFFICIENT_LIQUIDITY", "NFT_OWNERSHIP_CHANGED", "NFT_TRANSFER_FAILED",
    "CHAIN_CONFIRMATION_TIMEOUT", "USDC_PAYOUT_FAILED", "REFUND_PENDING", "REFUNDED", "MANUAL_REVIEW",
  ]);
  for (let i = 0; i < SUCCESS_PATH.length - 1; i++) {
    assert.ok(ALLOWED_TRANSITIONS[SUCCESS_PATH[i]!].includes(SUCCESS_PATH[i + 1]!));
  }
});

test("happy path walks every success state in order", () => {
  const e = new MockSettlementEngine();
  const t = e.quote(baseQuote("card"));
  e.reserveUsdc(t.id); e.authorizeInput(t.id); e.routeXents(t.id);
  e.beginNftTransfer(t.id); e.confirmNftTransfer(t.id); e.releaseUsdc(t.id); e.finalizeReceipt(t.id);
  assert.deepEqual(t.events.map((ev) => ev.to), [...SUCCESS_PATH]);
});

test("reserve-before-accept: buyer input cannot be authorized before USDC reservation", () => {
  const e = new MockSettlementEngine();
  const t = e.quote(baseQuote("card"));
  assert.throws(() => e.authorizeInput(t.id), InvariantViolation);
  assert.equal(t.state, "QUOTED");
});

test("insufficient pool liquidity blocks reservation", () => {
  const e = new MockSettlementEngine({ pool: { availableUsdc: 10, xentsDepthBps: 0 } });
  const t = e.quote(baseQuote("card", { sellerUsdcAmount: 40 }));
  e.reserveUsdc(t.id);
  assert.equal(t.state, "INSUFFICIENT_LIQUIDITY");
  assert.equal(t.reservedUsdc, 0);
  assert.throws(() => e.authorizeInput(t.id), InvariantViolation);
});

test("dual-verify-before-complete: USDC release requires NFT confirmation; finalize requires both", () => {
  const e = new MockSettlementEngine();
  const t = e.quote(baseQuote("usdc-base"));
  e.reserveUsdc(t.id); e.authorizeInput(t.id); e.routeXents(t.id); e.beginNftTransfer(t.id);
  assert.throws(() => e.releaseUsdc(t.id), InvariantViolation);
  assert.throws(() => e.finalizeReceipt(t.id), InvariantViolation);
  e.confirmNftTransfer(t.id);
  assert.throws(() => e.finalizeReceipt(t.id), InvariantViolation);
  e.releaseUsdc(t.id);
  e.finalizeReceipt(t.id);
  assert.equal(t.state, "RECEIPT_FINALIZED");
  assert.ok(t.nftTransferVerified && t.usdcPayoutVerified);
});

test("quote expiry releases reservation and terminates", () => {
  const c = clock();
  const e = new MockSettlementEngine({ now: c.now, pool: { availableUsdc: 100, xentsDepthBps: 0 } });
  const t = e.quote(baseQuote("card", { quoteTtlMs: 1_000, sellerUsdcAmount: 40 }));
  e.reserveUsdc(t.id);
  assert.equal(e.pool.availableUsdc, 60);
  c.advance(5_000);
  e.authorizeInput(t.id);
  assert.equal(t.state, "QUOTE_EXPIRED");
  assert.equal(e.pool.availableUsdc, 100);
});

test("slippage cap exceeded routes to INSUFFICIENT_LIQUIDITY then REFUND_PENDING", () => {
  const e = new MockSettlementEngine();
  const t = e.quote(baseQuote("supported-crypto", { maxSlippageBps: 50 }));
  e.reserveUsdc(t.id); e.authorizeInput(t.id);
  e.routeXents(t.id, t.quote.xentsExactOut * 0.9);
  assert.deepEqual(t.events.slice(-2).map((ev) => ev.to), ["INSUFFICIENT_LIQUIDITY", "REFUND_PENDING"]);
  assert.equal(t.reservedUsdc, 0);
  e.completeRefund(t.id);
  assert.equal(t.state, "REFUNDED");
});

test("idempotent event ids: replaying a command does not duplicate events", () => {
  const e = new MockSettlementEngine();
  const t = e.quote(baseQuote("card"));
  e.reserveUsdc(t.id, "idem-1");
  const before = t.events.length;
  e.reserveUsdc(t.id, "idem-1");
  assert.equal(t.events.length, before);
  assert.equal(e.pool.availableUsdc, 10_000 - t.quote.sellerUsdcAmount);
  const ids = t.events.map((ev) => ev.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("illegal transitions are rejected", () => {
  const e = new MockSettlementEngine();
  const t = e.quote(baseQuote("card"));
  assert.throws(() => e.routeXents(t.id), InvariantViolation);
  assert.throws(() => e.finalizeReceipt(t.id), InvariantViolation);
  e.reserveUsdc(t.id); e.authorizeInput(t.id); e.routeXents(t.id); e.beginNftTransfer(t.id);
  e.confirmNftTransfer(t.id, "timeout");
  assert.equal(t.state, "MANUAL_REVIEW");
  assert.throws(() => e.beginRefund(t.id), InvariantViolation);
});

test("payout failure after NFT moved escalates to MANUAL_REVIEW and keeps reservation", () => {
  const e = new MockSettlementEngine();
  const t = e.quote(baseQuote("card"));
  e.reserveUsdc(t.id); e.authorizeInput(t.id); e.routeXents(t.id); e.beginNftTransfer(t.id); e.confirmNftTransfer(t.id);
  e.releaseUsdc(t.id, false);
  assert.equal(t.state, "MANUAL_REVIEW");
  assert.equal(t.reservedUsdc, t.quote.sellerUsdcAmount);
});

test("receipt: canonical JSON is key-sorted and mock signature verifies", () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] }), '{"a":[{"c":3,"d":2}],"b":1}');
  const e = new MockSettlementEngine();
  const t = SCENARIOS.find((s) => s.id === "signed-receipt")!.run(e);
  const r = buildReceipt(t);
  assert.equal(r.banner, MOCK_BANNER);
  assert.match(r.signatureLabel, /mock signature/);
  assert.ok(verifyReceipt(r));
  assert.ok(!verifyReceipt({ ...r, sellerUsdcAmount: r.sellerUsdcAmount + 1 }));
});

test("every scenario runs and lands in a canonical state", () => {
  const all = new Set<string>([...SUCCESS_PATH, ...TERMINAL_STATES]);
  for (const s of SCENARIOS) {
    const t = s.run(new MockSettlementEngine());
    assert.ok(all.has(t.state), `${s.id} -> ${t.state}`);
  }
});

test("no wallet/RPC/payment client dependencies in source", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  assert.equal(pkg.dependencies, undefined);
});

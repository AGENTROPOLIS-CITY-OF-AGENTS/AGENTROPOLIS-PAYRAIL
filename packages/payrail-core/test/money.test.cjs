const test = require("node:test");
const assert = require("node:assert/strict");
const {
  addUsdc,
  formatUsdc,
  getEvmChainById,
  getEvmChainBySlug,
  parseUsdc,
  scaleUsdcToDecimals,
} = require("../dist/index.js");

test("exact decimal arithmetic: 0.1 + 0.2 = 0.3", () => {
  assert.equal(
    addUsdc(parseUsdc("0.1"), parseUsdc("0.2")),
    parseUsdc("0.3"),
  );
});

test("parse/format round trips exact values", () => {
  for (const value of ["0", "0.000001", "0.1", "1", "12.340001", "999999.999999"]) {
    assert.equal(parseUsdc(formatUsdc(parseUsdc(value))), parseUsdc(value));
  }
});

test("invalid and over-precision money is rejected", () => {
  for (const value of ["", "-1", "NaN", "Infinity", "1e3", "0.0000001", ".1", "01.0"]) {
    assert.throws(() => parseUsdc(value));
  }
});

test("Arc rail scaling is explicit and exact", () => {
  assert.equal(scaleUsdcToDecimals(parseUsdc("1"), 18), 1_000_000_000_000_000_000n);
  assert.equal(scaleUsdcToDecimals(parseUsdc("0.1"), 18), 100_000_000_000_000_000n);
});

test("known Arc chains resolve and unknown chains fail closed", () => {
  assert.equal(getEvmChainById(5042)?.slug, "arc-mainnet");
  assert.equal(getEvmChainById(5042002)?.slug, "arc-testnet");
  assert.equal(getEvmChainBySlug("arc-mainnet")?.chainId, 5042);
  assert.equal(getEvmChainBySlug("arc-testnet")?.chainId, 5042002);
  assert.equal(getEvmChainById(999999999), undefined);
  assert.equal(getEvmChainBySlug("unknown-chain"), undefined);
});

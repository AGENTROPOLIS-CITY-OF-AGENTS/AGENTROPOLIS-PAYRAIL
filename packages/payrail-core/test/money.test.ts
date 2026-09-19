import { test } from "node:test";
import assert from "node:assert/strict";

import {
  USDC_ERC20_DECIMALS,
  ARC_NATIVE_USDC_DECIMALS,
  usdcMinorUnits,
  arcNativeUsdcMinorUnits,
  parseDecimalToMinorUnits,
  parseUsdc,
  parseArcNativeUsdc,
  formatMinorUnits,
  formatMoney,
  addMoney,
  subMoney,
  compareMoney,
  moneyEquals,
  usdcToArcNative,
  arcNativeToUsdc,
  legacyUsdcToMinorUnits,
  minorUnitsToLegacyUsdc,
} from "../src/money.js";

test("USDC scales are distinct: ERC-20 is 6 decimals, Arc native is 18", () => {
  assert.equal(USDC_ERC20_DECIMALS, 6);
  assert.equal(ARC_NATIVE_USDC_DECIMALS, 18);
  assert.notEqual(USDC_ERC20_DECIMALS, ARC_NATIVE_USDC_DECIMALS);
});

test("parseDecimalToMinorUnits: 0.05 USDC (6) = 50000 minor units", () => {
  assert.equal(parseDecimalToMinorUnits("0.05", 6), 50000n);
});

test("parseDecimalToMinorUnits: 1 USDC (6) = 1000000 minor units", () => {
  assert.equal(parseDecimalToMinorUnits("1", 6), 1000000n);
});

test("parseDecimalToMinorUnits: 0.05 Arc native (18) = 50000000000000000", () => {
  assert.equal(parseDecimalToMinorUnits("0.05", 18), 50000000000000000n);
});

test("parseDecimalToMinorUnits rejects negative and malformed input", () => {
  assert.throws(() => parseDecimalToMinorUnits("-1", 6));
  assert.throws(() => parseDecimalToMinorUnits("abc", 6));
  assert.throws(() => parseDecimalToMinorUnits("1.2.3", 6));
});

test("parseDecimalToMinorUnits rejects more fractional digits than the scale", () => {
  assert.throws(() => parseDecimalToMinorUnits("0.0000001", 6));
  assert.throws(() => parseDecimalToMinorUnits("0.0000000000000000001", 18));
});

test("parseUsdc / parseArcNativeUsdc produce distinct kinds", () => {
  const usdc = parseUsdc("0.05");
  const arc = parseArcNativeUsdc("0.05");
  assert.equal(usdc.kind, "erc20");
  assert.equal(usdc.decimals, 6);
  assert.equal(arc.kind, "arc-native");
  assert.equal(arc.decimals, 18);
  // Same nominal amount, wildly different minor-unit counts.
  assert.equal(usdc.minorUnits, 50000n);
  assert.equal(arc.minorUnits, 50000000000000000n);
});

test("formatMinorUnits / formatMoney round-trip", () => {
  assert.equal(formatMinorUnits(50000n, 6), "0.050000");
  assert.equal(formatMoney(parseUsdc("0.05")), "0.050000");
  assert.equal(formatMoney(parseArcNativeUsdc("0.05")), "0.050000000000000000");
});

test("addMoney / subMoney operate on integer minor units", () => {
  const a = parseUsdc("0.10");
  const b = parseUsdc("0.05");
  assert.equal(addMoney(a, b).minorUnits, 150000n);
  assert.equal(subMoney(a, b).minorUnits, 50000n);
  assert.throws(() => subMoney(b, a)); // negative result
});

test("addMoney / subMoney refuse to mix scales", () => {
  const usdc = parseUsdc("0.10");
  const arc = parseArcNativeUsdc("0.10");
  assert.throws(() => addMoney(usdc, arc));
  assert.throws(() => subMoney(usdc, arc));
  assert.throws(() => compareMoney(usdc, arc));
});

test("compareMoney / moneyEquals", () => {
  assert.equal(compareMoney(parseUsdc("0.05"), parseUsdc("0.10")), -1);
  assert.equal(compareMoney(parseUsdc("0.10"), parseUsdc("0.05")), 1);
  assert.equal(compareMoney(parseUsdc("0.05"), parseUsdc("0.05")), 0);
  assert.ok(moneyEquals(parseUsdc("0.05"), parseUsdc("0.05")));
  assert.ok(!moneyEquals(parseUsdc("0.05"), parseUsdc("0.06")));
});

test("usdcToArcNative is an explicit ×10^12 scale change", () => {
  const usdc = parseUsdc("0.05");
  const arc = usdcToArcNative(usdc);
  assert.equal(arc.kind, "arc-native");
  assert.equal(arc.decimals, 18);
  assert.equal(arc.minorUnits, 50000n * 10n ** 12n);
});

test("arcNativeToUsdc round-trips exact 6-decimal values", () => {
  const arc = parseArcNativeUsdc("0.05");
  const usdc = arcNativeToUsdc(arc);
  assert.equal(usdc.kind, "erc20");
  assert.equal(usdc.minorUnits, 50000n);
});

test("arcNativeToUsdc refuses sub-6-decimal precision loss", () => {
  // 0.000000000000000001 Arc native = 1 minor unit at 18 decimals, which is
  // below 6-decimal resolution and cannot be represented in ERC-20 USDC.
  const arc = arcNativeUsdcMinorUnits(1n);
  assert.throws(() => arcNativeToUsdc(arc));
});

test("legacy float bridge converts without drift", () => {
  assert.equal(legacyUsdcToMinorUnits(0.05), 50000n);
  assert.equal(legacyUsdcToMinorUnits(1), 1000000n);
  assert.equal(minorUnitsToLegacyUsdc(50000n), 0.05);
  assert.throws(() => legacyUsdcToMinorUnits(-1));
  assert.throws(() => legacyUsdcToMinorUnits(Number.NaN));
});

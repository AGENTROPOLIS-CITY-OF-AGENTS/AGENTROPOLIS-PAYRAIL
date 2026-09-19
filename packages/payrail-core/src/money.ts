// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — payrail-core / money
//
// Integer-safe money representation.
//
// Floating-point arithmetic is forbidden for money. All monetary values are
// carried as integer minor units (bigint) with an explicit decimal scale.
//
// Two USDC representations are intentionally distinct and MUST NOT be mixed:
//   - ERC-20 USDC  : 6  decimal places (the canonical PAYRAIL settlement asset)
//   - Arc native   : 18 decimal places (Arc's native gas token is USDC at 18)
//
// The Money discriminated union makes the scale explicit and type-enforced so
// a 6-decimal amount can never be silently treated as an 18-decimal amount.
// ---------------------------------------------------------------------------

export const USDC_ERC20_DECIMALS = 6 as const;
export const ARC_NATIVE_USDC_DECIMALS = 18 as const;

/** Integer minor units (bigint) — the only safe money representation. */
export type MinorUnits = bigint;

/** A monetary value with an explicit decimal scale. */
export type Money =
  | { asset: "USDC"; kind: "erc20"; decimals: 6; minorUnits: MinorUnits }
  | { asset: "USDC"; kind: "arc-native"; decimals: 18; minorUnits: MinorUnits };

/** ERC-20 USDC (6 decimals) — the canonical PAYRAIL settlement asset. */
export type UsdcMinorUnits = MinorUnits & { readonly __brand: "UsdcMinorUnits" };

/** Arc native USDC (18 decimals) — Arc's native gas token. */
export type ArcNativeUsdcMinorUnits = MinorUnits & {
  readonly __brand: "ArcNativeUsdcMinorUnits";
};

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/** Build an ERC-20 USDC (6-decimal) Money value from integer minor units. */
export function usdcMinorUnits(minorUnits: bigint): Money {
  if (minorUnits < 0n) {
    throw new Error("usdcMinorUnits: minor units must be non-negative");
  }
  return { asset: "USDC", kind: "erc20", decimals: 6, minorUnits };
}

/** Build an Arc native USDC (18-decimal) Money value from integer minor units. */
export function arcNativeUsdcMinorUnits(minorUnits: bigint): Money {
  if (minorUnits < 0n) {
    throw new Error("arcNativeUsdcMinorUnits: minor units must be non-negative");
  }
  return { asset: "USDC", kind: "arc-native", decimals: 18, minorUnits };
}

// ---------------------------------------------------------------------------
// Decimal-string parsing (no floats)
// ---------------------------------------------------------------------------

/**
 * Parse a decimal string into integer minor units for a given scale.
 * Accepts "0.05", "1", "0.000001" etc. Rejects negative, NaN, and values with
 * more fractional digits than the scale allows.
 */
export function parseDecimalToMinorUnits(
  value: string,
  decimals: number,
): bigint {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(value)) {
    throw new Error(`parseDecimalToMinorUnits: invalid decimal string "${value}"`);
  }
  const [whole = "0", frac = ""] = value.split(".");
  if (frac.length > decimals) {
    throw new Error(
      `parseDecimalToMinorUnits: "${value}" has more than ${decimals} fractional digits`,
    );
  }
  const padded = frac.padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

/** Parse an ERC-20 USDC (6-decimal) decimal string into minor units. */
export function parseUsdc(value: string): Money {
  return usdcMinorUnits(parseDecimalToMinorUnits(value, USDC_ERC20_DECIMALS));
}

/** Parse an Arc native USDC (18-decimal) decimal string into minor units. */
export function parseArcNativeUsdc(value: string): Money {
  return arcNativeUsdcMinorUnits(
    parseDecimalToMinorUnits(value, ARC_NATIVE_USDC_DECIMALS),
  );
}

// ---------------------------------------------------------------------------
// Formatting (no floats)
// ---------------------------------------------------------------------------

/** Format minor units as a decimal string for a given scale. */
export function formatMinorUnits(minorUnits: bigint, decimals: number): string {
  if (minorUnits < 0n) {
    throw new Error("formatMinorUnits: minor units must be non-negative");
  }
  const scale = 10n ** BigInt(decimals);
  const whole = minorUnits / scale;
  const frac = (minorUnits % scale).toString().padStart(decimals, "0");
  return decimals === 0 ? whole.toString() : `${whole}.${frac}`;
}

/** Format a Money value as a decimal string (e.g. "0.050000"). */
export function formatMoney(money: Money): string {
  return formatMinorUnits(money.minorUnits, money.decimals);
}

// ---------------------------------------------------------------------------
// Arithmetic (integer-only)
// ---------------------------------------------------------------------------

/** Add two Money values of the SAME scale. Throws if scales differ. */
export function addMoney(a: Money, b: Money): Money {
  assertSameScale(a, b, "addMoney");
  return { ...a, minorUnits: a.minorUnits + b.minorUnits };
}

/** Subtract two Money values of the SAME scale. Throws if scales differ. */
export function subMoney(a: Money, b: Money): Money {
  assertSameScale(a, b, "subMoney");
  if (b.minorUnits > a.minorUnits) {
    throw new Error("subMoney: result would be negative");
  }
  return { ...a, minorUnits: a.minorUnits - b.minorUnits };
}

/** Compare two Money values of the SAME scale. Returns -1, 0, or 1. */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameScale(a, b, "compareMoney");
  if (a.minorUnits < b.minorUnits) return -1;
  if (a.minorUnits > b.minorUnits) return 1;
  return 0;
}

/** True if two Money values of the SAME scale are equal. */
export function moneyEquals(a: Money, b: Money): boolean {
  return a.asset === b.asset && a.kind === b.kind && a.minorUnits === b.minorUnits;
}

function assertSameScale(a: Money, b: Money, op: string): void {
  if (a.decimals !== b.decimals || a.kind !== b.kind) {
    throw new Error(
      `${op}: cannot mix ${a.kind} (${a.decimals} decimals) with ${b.kind} (${b.decimals} decimals)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Scale conversion (explicit, never implicit)
// ---------------------------------------------------------------------------

/**
 * Convert an ERC-20 USDC (6-decimal) value to Arc native USDC (18-decimal).
 * This is a pure scale change (×10^12) and is explicit — callers must opt in.
 */
export function usdcToArcNative(usdc: Money): Money {
  if (usdc.kind !== "erc20") {
    throw new Error("usdcToArcNative: input must be ERC-20 USDC (6 decimals)");
  }
  return arcNativeUsdcMinorUnits(usdc.minorUnits * 10n ** 12n);
}

/**
 * Convert an Arc native USDC (18-decimal) value to ERC-20 USDC (6-decimal).
 * Throws if the 18-decimal value has sub-6-decimal precision that would be lost.
 */
export function arcNativeToUsdc(arc: Money): Money {
  if (arc.kind !== "arc-native") {
    throw new Error("arcNativeToUsdc: input must be Arc native USDC (18 decimals)");
  }
  const scale = 10n ** 12n;
  if (arc.minorUnits % scale !== 0n) {
    throw new Error(
      "arcNativeToUsdc: 18-decimal value has sub-6-decimal precision that cannot be represented in ERC-20 USDC",
    );
  }
  return usdcMinorUnits(arc.minorUnits / scale);
}

// ---------------------------------------------------------------------------
// JSON/API-safe integer boundary
// ---------------------------------------------------------------------------

/**
 * JSON cannot encode bigint. Public API / receipt boundaries therefore carry
 * USDC ERC-20 minor units as a canonical unsigned integer string.
 *
 * Example: "50000" = 0.05 USDC at the canonical 6-decimal ERC-20 scale.
 */
export type UsdcMinorUnitString = string & {
  readonly __brand: "UsdcMinorUnitString";
};

export function usdcMinorUnitString(value: string | bigint): UsdcMinorUnitString {
  const raw = typeof value === "bigint" ? value.toString() : value;
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(
      "usdcMinorUnitString: value must be a canonical non-negative integer string",
    );
  }
  return raw as UsdcMinorUnitString;
}

export function usdcMinorUnitBigInt(value: UsdcMinorUnitString): bigint {
  return BigInt(value);
}

export function usdcMinorUnitStringToMoney(value: UsdcMinorUnitString): Money {
  return usdcMinorUnits(usdcMinorUnitBigInt(value));
}

export function formatUsdcMinorUnitString(value: UsdcMinorUnitString): string {
  return formatMinorUnits(usdcMinorUnitBigInt(value), USDC_ERC20_DECIMALS);
}

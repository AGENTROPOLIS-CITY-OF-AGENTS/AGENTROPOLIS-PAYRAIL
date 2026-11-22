// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — escrow-sim / escrow-receipt
//
// SIMULATION ONLY. NEW implementation built Nov 22, 2026 for mentorship
// INTEGRATE task I-3. NOT the PAYRAIL54 v2 SQL. NOT a recovery. NOT a
// P0/P1 remediation. Does not verify CIP-54, the issuer adapter, or the
// FA54/issuer workers. D-3 stays BLOCKED.
//
// Canonical key-sorted JSON receipts and the SHA-256 hash chain (Section 5.3,
// invariants 4 and 5). Every receipt carries the fixed clock value injected
// at engine construction, never wall-clock time, so a re-run of the same
// seeded operation sequence is byte-identical. All money is integer minor
// units carried as decimal strings; no floats appear anywhere.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";

import type { EscrowState, EscrowTransition } from "./escrow-states";

/** Previous-hash value of the first receipt in a chain. */
export const GENESIS_PREV_HASH = "GENESIS" as const;

/** Funds buckets at one receipt. All values are integer minor-unit strings. */
export interface EscrowBalances {
  /** Funds still available in the simulated pool. */
  pool: string;
  /** Funds locked in FUNDED or DISPUTED escrows. */
  escrowed: string;
  /** Funds moved to sellers by release. */
  released: string;
  /** Funds returned to buyers by refund. */
  refunded: string;
  /** Opening pool balance (constant for the engine). */
  opening: string;
}

/** Body of one receipt, before the hash is computed. */
export interface EscrowReceiptBody {
  version: 1;
  seq: number;
  eventId: string;
  escrowId: string;
  transition: EscrowTransition;
  fromState: EscrowState | null;
  toState: EscrowState;
  /** Escrow amount, integer minor units as a decimal string. */
  amount: string;
  asset: string;
  buyer: string;
  seller: string;
  expiry: string;
  /** Opaque caller-supplied ENTITY54 ALLOW receipt, or null when not required. */
  authorizationReceipt: string | null;
  /** Opaque caller-supplied completion-evidence record, or null when not required. */
  completionEvidence: string | null;
  balances: EscrowBalances;
  /** Fixed clock value injected at engine construction, never wall-clock time. */
  clock: string;
  prevHash: string;
}

/** A receipt: body plus its SHA-256 hash. */
export type EscrowReceipt = EscrowReceiptBody & { hash: string };

/**
 * Canonical JSON: object keys sorted recursively, arrays in order, no
 * whitespace. `undefined` values are dropped (JSON.stringify behavior);
 * bigint values are rejected here because receipts carry money as strings.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint") {
      throw new Error("canonicalJson: bigint must be carried as a decimal string");
    }
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new Error("canonicalJson: value is not JSON-encodable");
    }
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  const parts = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`,
  );
  return `{${parts.join(",")}}`;
}

/** SHA-256 hex digest of a canonical-JSON string. */
export function sha256Hex(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Hash of a receipt body: SHA-256 of its canonical JSON. */
export function hashReceiptBody(body: EscrowReceiptBody): string {
  return sha256Hex(canonicalJson(body));
}

/** Attach the hash to a receipt body, producing a complete receipt. */
export function sealReceipt(body: EscrowReceiptBody): EscrowReceipt {
  return { ...body, hash: hashReceiptBody(body) };
}

/**
 * Verify a receipt chain by independent hash recomputation: every receipt's
 * hash must recompute from its body, sequence numbers must run 1..n, and
 * each prevHash must equal the previous receipt's hash (GENESIS for the
 * first). Returns false on any mismatch; does not throw on bad input.
 */
export function verifyReceiptChain(receipts: readonly EscrowReceipt[]): boolean {
  let expectedPrevHash: string = GENESIS_PREV_HASH;
  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i];
    if (receipt === undefined) return false;
    if (receipt.seq !== i + 1) return false;
    if (receipt.prevHash !== expectedPrevHash) return false;
    const { hash, ...body } = receipt;
    if (hashReceiptBody(body as EscrowReceiptBody) !== hash) return false;
    expectedPrevHash = hash;
  }
  return true;
}

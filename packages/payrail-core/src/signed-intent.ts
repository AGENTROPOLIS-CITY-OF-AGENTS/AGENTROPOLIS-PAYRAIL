// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — payrail-core / signed-intent
//
// Signed economic intent binding.
//
// A signedIntent is the agent's cryptographically-bound economic intent. It
// MUST bind every field that determines what value moves, where it goes, and
// under what authority. The adapter refuses any intent whose binding is
// incomplete or mismatched.
//
// Bound fields (per ARC-SECURITY-ENVELOPE / ECONOMIC-FABRIC-ROUTING):
//   actor, mandate, amount, asset, recipient, chain, provider, fee policy,
//   quote, expiry, Execution Envelope, AEGIS decision, 54T attestation.
//
// This module does NOT perform signing or verify cryptographic signatures —
// that is the external signer's responsibility (Phase 2). It defines the
// binding contract and validates that every required field is present and
// consistent.
// ---------------------------------------------------------------------------

import type { Money } from "./money";
import type { SettlementRailSlug } from "./index";

/** A reference to an external authority artifact (id + optional hash). */
export interface AuthorityRef {
  id: string;
  hash?: string;
}

/** A quote reference: the exact amount quoted and its expiry. */
export interface QuoteRef {
  quoteId: string;
  quoteHash: string;
  amountMinorUnits: bigint;
  expiresAt: string; // ISO 8601
}

/** A fee-policy reference: the policy id and the maximum total fee bound. */
export interface FeePolicyRef {
  feePolicyId: string;
  maxTotalFeeMinorUnits: bigint;
}

/** The full set of fields a signedIntent must bind. */
export interface SignedIntentBindings {
  actor: string; // AGENT-ENTITY:<id>
  mandate: string; // mandate id / hash
  amount: Money;
  asset: string; // e.g. "USDC"
  recipient: string; // verified counterparty address
  chain: SettlementRailSlug;
  provider: string; // e.g. "arc", "circle-app-kit", "x402"
  feePolicy: FeePolicyRef;
  quote: QuoteRef;
  expiry: string; // ISO 8601 — short-lived
  executionEnvelope: AuthorityRef; // Execution Envelope
  aegisDecision: AuthorityRef; // AEGIS decision
  attestation54t: AuthorityRef; // 54T attestation
}

/** A signed economic intent. */
export interface SignedIntent {
  version: 1;
  intentId: string;
  bindings: SignedIntentBindings;
  /** Set by the external signer (Phase 2). Absent until then. */
  signature?: string;
  signedAt?: string; // ISO 8601
}

/** The required binding keys, in canonical order (for error reporting). */
export const SIGNED_INTENT_BINDING_KEYS = [
  "actor",
  "mandate",
  "amount",
  "asset",
  "recipient",
  "chain",
  "provider",
  "feePolicy",
  "quote",
  "expiry",
  "executionEnvelope",
  "aegisDecision",
  "attestation54t",
] as const;

export type SignedIntentBindingKey = (typeof SIGNED_INTENT_BINDING_KEYS)[number];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a SignedIntent binds every required field and that the
 * binding is internally consistent. Returns a list of problems (empty = valid).
 */
export function validateSignedIntentBindings(
  intent: SignedIntent,
): string[] {
  const problems: string[] = [];
  const b = intent.bindings;

  if (!b.actor) problems.push("actor is required");
  if (!b.mandate) problems.push("mandate is required");
  if (!b.amount || b.amount.minorUnits < 0n) problems.push("amount is required and must be non-negative");
  if (!b.asset) problems.push("asset is required");
  if (!b.recipient) problems.push("recipient is required");
  if (!b.chain) problems.push("chain is required");
  if (!b.provider) problems.push("provider is required");
  if (!b.feePolicy?.feePolicyId) problems.push("feePolicy.feePolicyId is required");
  if (b.feePolicy && b.feePolicy.maxTotalFeeMinorUnits < 0n) {
    problems.push("feePolicy.maxTotalFeeMinorUnits must be non-negative");
  }
  if (!b.quote?.quoteId) problems.push("quote.quoteId is required");
  if (!b.quote?.quoteHash) problems.push("quote.quoteHash is required");
  if (!b.quote?.expiresAt) problems.push("quote.expiresAt is required");
  if (b.quote && b.quote.amountMinorUnits < 0n) {
    problems.push("quote.amountMinorUnits must be non-negative");
  }
  if (!b.expiry) problems.push("expiry is required");
  if (!b.executionEnvelope?.id) problems.push("executionEnvelope.id is required");
  if (!b.aegisDecision?.id) problems.push("aegisDecision.id is required");
  if (!b.attestation54t?.id) problems.push("attestation54t.id is required");

  // Quote amount must match the intent amount (same scale).
  if (b.amount && b.quote && b.quote.amountMinorUnits !== b.amount.minorUnits) {
    problems.push("quote.amountMinorUnits does not match intent amount");
  }

  // Expiry must be a valid ISO timestamp and not already past.
  if (b.expiry) {
    const expiryMs = Date.parse(b.expiry);
    if (Number.isNaN(expiryMs)) {
      problems.push("expiry is not a valid ISO 8601 timestamp");
    } else if (expiryMs <= Date.now()) {
      problems.push("expiry is in the past");
    }
  }

  return problems;
}

/**
 * True if the intent binds every required field consistently.
 */
export function isSignedIntentValid(intent: SignedIntent): boolean {
  return validateSignedIntentBindings(intent).length === 0;
}

/**
 * Verify that a SignedIntent's binding matches a set of expected references.
 * Returns a list of mismatched keys (empty = all match).
 */
export function verifySignedIntentBinding(
  intent: SignedIntent,
  expected: Partial<SignedIntentBindings>,
): string[] {
  const mismatches: string[] = [];
  const b = intent.bindings;

  if (expected.actor !== undefined && b.actor !== expected.actor) mismatches.push("actor");
  if (expected.mandate !== undefined && b.mandate !== expected.mandate) mismatches.push("mandate");
  if (expected.asset !== undefined && b.asset !== expected.asset) mismatches.push("asset");
  if (expected.recipient !== undefined && b.recipient !== expected.recipient) mismatches.push("recipient");
  if (expected.chain !== undefined && b.chain !== expected.chain) mismatches.push("chain");
  if (expected.provider !== undefined && b.provider !== expected.provider) mismatches.push("provider");
  if (expected.expiry !== undefined && b.expiry !== expected.expiry) mismatches.push("expiry");

  if (expected.amount !== undefined && b.amount.minorUnits !== expected.amount.minorUnits) {
    mismatches.push("amount");
  }
  if (
    expected.feePolicy !== undefined &&
    b.feePolicy.feePolicyId !== expected.feePolicy.feePolicyId
  ) {
    mismatches.push("feePolicy");
  }
  if (
    expected.quote !== undefined &&
    (b.quote.quoteId !== expected.quote.quoteId ||
      b.quote.quoteHash !== expected.quote.quoteHash)
  ) {
    mismatches.push("quote");
  }
  if (
    expected.executionEnvelope !== undefined &&
    b.executionEnvelope.id !== expected.executionEnvelope.id
  ) {
    mismatches.push("executionEnvelope");
  }
  if (
    expected.aegisDecision !== undefined &&
    b.aegisDecision.id !== expected.aegisDecision.id
  ) {
    mismatches.push("aegisDecision");
  }
  if (
    expected.attestation54t !== undefined &&
    b.attestation54t.id !== expected.attestation54t.id
  ) {
    mismatches.push("attestation54t");
  }

  return mismatches;
}

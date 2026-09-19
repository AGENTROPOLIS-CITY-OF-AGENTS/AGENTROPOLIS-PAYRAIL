// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — x402-adapter
//
// Guarded x402 / USDC settlement adapters.
//
// ⚠️  This module NEVER stores, accepts, or processes private keys or seed phrases.
// ⚠️  "No agent gets raw wallet power."
//
// Real settlement must use an external signing service and pass PAYRAIL policy,
// Execution Envelope, and AEGIS gates. Base remains the default settlement lane;
// Arc is an additive, chain-agnostic rail.
//
// Result shapes use the canonical SettlementOutcome vocabulary
// (SIMULATED / PENDING / SETTLED / BLOCKED / FAILED). A SIMULATED result
// NEVER carries a txHash.
// ---------------------------------------------------------------------------

import type { UsdcMinorUnitString } from "@agentropolis/payrail-core";
import {
  ReplayGuard,
  formatUsdcMinorUnitString,
  redactSecrets,
  simulatedOutcome,
  type SettlementOutcome,
} from "@agentropolis/payrail-core";

export * from "./arc";

/** A settlement request sent to the x402 adapter.
 *  Note: contains NO private key — signing happens in an external service. */
export interface SettlementRequest {
  receiptId: string;
  agentId: string;
  districtId: string;
  toAddress: string;
  amountMinorUnits: UsdcMinorUnitString;
  taskId: string;
  /** Unique idempotency key for replay protection. */
  idempotencyKey: string;
  /** Signed payment intent from external signing service (Phase 2). */
  signedIntent?: string;
}

/**
 * Module-level replay guard.
 *
 * ⚠️  NON-DURABLE / NOT PRODUCTION COMPLETE — in-memory only, resets on
 * restart. Phase 1 must replace with a persistent store before live settlement.
 */
export const replayGuard = new ReplayGuard();

/**
 * Settle a payment via the legacy/default x402 / USDC lane.
 *
 * Current behavior is simulation-only. Arc-specific requests should use
 * settleOnArc(), which is also guarded and simulation-only in this build.
 *
 * Returns a SettlementOutcome. A SIMULATED outcome never carries a txHash.
 */
export async function settle(request: SettlementRequest): Promise<SettlementOutcome> {
  // Atomically reserve before the first asynchronous boundary so concurrent
  // retries cannot both proceed.
  if (!replayGuard.tryReserve(request.idempotencyKey)) {
    return {
      status: "BLOCKED",
      message: "Replay detected: idempotency key already used.",
      reason: "duplicate-idempotency-key",
    };
  }

  try {
    console.warn(
      "[x402-adapter] STUB: Real settlement not implemented. Returning simulated result.",
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const outcome = simulatedOutcome(
      redactSecrets(
        `[SIMULATED] Settlement of ${formatUsdcMinorUnitString(request.amountMinorUnits)} USDC to ${request.toAddress} — not yet real.`,
      ),
      `sim-${request.idempotencyKey}`,
    );

    replayGuard.completeReservation(request.idempotencyKey, outcome);
    return outcome;
  } catch (error) {
    replayGuard.releaseReservation(request.idempotencyKey);
    throw error;
  }
}

/**
 * Verify a settlement by tx hash.
 *
 * Current behavior is intentionally unconfirmed until a live provider adapter
 * is explicitly enabled.
 */
export async function verifySettlement(txHash: string): Promise<boolean> {
  console.warn(
    `[x402-adapter] STUB: verifySettlement(${txHash}) — live verification not enabled.`,
  );
  return false;
}

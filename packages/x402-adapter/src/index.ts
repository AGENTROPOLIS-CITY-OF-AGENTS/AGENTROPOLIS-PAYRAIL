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
// ---------------------------------------------------------------------------

import type { UsdcAmount } from "@agentropolis/payrail-core";

export * from "./arc";

/** A settlement request sent to the x402 adapter.
 *  Note: contains NO private key — signing happens in an external service. */
export interface SettlementRequest {
  receiptId: string;
  agentId: string;
  districtId: string;
  toAddress: string;
  amountUsdc: UsdcAmount;
  taskId: string;
  /** Signed payment intent from external signing service (Phase 2) */
  signedIntent?: string;
}

export interface SettlementResult {
  success: boolean;
  txHash: string | null;
  message: string;
  simulatedOnly: boolean;
}

/**
 * Settle a payment via the legacy/default x402 / USDC lane.
 *
 * Current behavior is simulation-only. Arc-specific requests should use
 * settleOnArc(), which is also guarded and simulation-only in this build.
 */
export async function settle(request: SettlementRequest): Promise<SettlementResult> {
  console.warn(
    "[x402-adapter] STUB: Real settlement not implemented. Returning simulated result."
  );

  await new Promise((resolve) => setTimeout(resolve, 50));

  return {
    success: true,
    txHash: null,
    message: `[SIMULATED] Settlement of $${request.amountUsdc} USDC to ${request.toAddress} — not yet real.`,
    simulatedOnly: true,
  };
}

/**
 * Verify a settlement by tx hash.
 *
 * Current behavior is intentionally unconfirmed until a live provider adapter
 * is explicitly enabled.
 */
export async function verifySettlement(txHash: string): Promise<boolean> {
  console.warn(
    `[x402-adapter] STUB: verifySettlement(${txHash}) — live verification not enabled.`
  );
  return false;
}

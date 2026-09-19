// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — x402-adapter
//
// Guarded x402 / USDC settlement adapters.
// No private keys, seed phrases, or raw signing power are accepted here.
// ---------------------------------------------------------------------------

import {
  EVM_CHAINS,
  formatUsdc,
  type ExecutedSettlement,
  type SettlementRailSlug,
  type UsdcAmount,
} from "@agentropolis/payrail-core";
import {
  SettlementExecutionBlockedError,
  type SimulatedSettlement,
} from "./shared";

export * from "./arc";
export * from "./shared";
export type { ExecutedSettlement } from "@agentropolis/payrail-core";

export interface SettlementRequest {
  receiptId: string;
  agentId: string;
  districtId: string;
  toAddress: string;
  amountUsdc: UsdcAmount;
  taskId: string;
  rail?: SettlementRailSlug;
  signedIntent?: string;
  approvalRef?: string;
  executionEnvelopeRef?: string;
  aegisDecisionRef?: string;
}

export async function simulateSettlement(
  request: SettlementRequest,
): Promise<SimulatedSettlement> {
  const rail = request.rail ?? "base";
  const chain = Object.values(EVM_CHAINS).find((candidate) => candidate.slug === rail);

  return {
    kind: "simulated",
    reason: "Live settlement is not enabled for the generic x402 lane.",
    receiptId: request.receiptId,
    rail,
    chainId: chain?.chainId ?? null,
    executionMode: "simulated",
    message:
      `[SIMULATED] Settlement of $${formatUsdc(request.amountUsdc)} USDC ` +
      `to ${request.toAddress}. No funds moved.`,
  };
}

/** Backward-compatible simulation alias. Never signals financial execution. */
export async function settle(
  request: SettlementRequest,
): Promise<SimulatedSettlement> {
  return simulateSettlement(request);
}

export async function executeSettlement(
  request: SettlementRequest,
): Promise<ExecutedSettlement> {
  if (!request.approvalRef || !request.executionEnvelopeRef || !request.aegisDecisionRef) {
    throw new SettlementExecutionBlockedError(
      "Execution blocked: approval, Execution Envelope, and AEGIS references are required.",
    );
  }

  if (!request.signedIntent) {
    throw new SettlementExecutionBlockedError(
      "Execution blocked: signedIntent is required for a live lane.",
    );
  }

  throw new SettlementExecutionBlockedError(
    "Live x402 settlement is disabled until signed-intent validation/binding, external signer, replay/idempotency, finality verification, and operator enablement are implemented.",
  );
}

export async function verifySettlement(_txHash: string): Promise<boolean> {
  // Unconfirmed-until-live: a stub must never create execution evidence.
  return false;
}

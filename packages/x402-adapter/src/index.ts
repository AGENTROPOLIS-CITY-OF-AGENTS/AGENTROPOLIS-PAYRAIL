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

export * from "./arc";
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

export interface SimulatedSettlement {
  kind: "simulated";
  reason: string;
  receiptId: string;
  rail: SettlementRailSlug;
  chainId: number | null;
  executionMode: "simulated";
  message: string;
}

export class SettlementExecutionBlockedError extends Error {
  readonly code = "SETTLEMENT_EXECUTION_BLOCKED";

  constructor(message: string) {
    super(message);
    this.name = "SettlementExecutionBlockedError";
  }
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

/**
 * Backward-compatible alias. It is explicitly simulation-only and carries no
 * success boolean or transaction hash.
 */
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

  throw new SettlementExecutionBlockedError(
    "Live x402 settlement is disabled until an external signer, signed-intent validation, replay/idempotency, finality verification, and operator enablement are implemented.",
  );
}

export async function verifySettlement(_txHash: string): Promise<boolean> {
  // Unconfirmed-until-live: a stub must never create execution evidence.
  return false;
}

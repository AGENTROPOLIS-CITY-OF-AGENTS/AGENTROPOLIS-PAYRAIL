import {
  EVM_CHAINS,
  formatUsdc,
  type EvmAddress,
  type ExecutedSettlement,
  type SettlementRailSlug,
  type UsdcAmount,
} from "@agentropolis/payrail-core";
import {
  SettlementExecutionBlockedError,
  type SimulatedSettlement,
} from "./index";

export interface ArcSettlementRequest {
  receiptId: string;
  agentId: string;
  taskId: string;
  districtId: string;
  toAddress: EvmAddress;
  amountUsdc: UsdcAmount;
  rail: Extract<SettlementRailSlug, "arc-testnet" | "arc-mainnet">;
  signedIntent?: string;
  approvalRef?: string;
  executionEnvelopeRef?: string;
  aegisDecisionRef?: string;
}

export type ArcSimulatedSettlement = SimulatedSettlement & {
  rail: ArcSettlementRequest["rail"];
};

export async function simulateSettlementOnArc(
  request: ArcSettlementRequest,
): Promise<ArcSimulatedSettlement> {
  const chain =
    request.rail === "arc-testnet"
      ? EVM_CHAINS.ARC_TESTNET
      : EVM_CHAINS.ARC_MAINNET;

  return {
    kind: "simulated",
    reason: "Arc simulation proves control flow only; it is not settlement evidence.",
    receiptId: request.receiptId,
    rail: request.rail,
    chainId: chain.chainId,
    executionMode: "simulated",
    message:
      `[SIMULATED] Arc settlement intent for $${formatUsdc(request.amountUsdc)} USDC ` +
      `to ${request.toAddress}. External signing is not enabled.`,
  };
}

export async function executeSettlementOnArc(
  request: ArcSettlementRequest,
): Promise<ExecutedSettlement> {
  if (!request.approvalRef || !request.executionEnvelopeRef || !request.aegisDecisionRef) {
    throw new SettlementExecutionBlockedError(
      "Arc execution blocked: approval, Execution Envelope, and AEGIS decision references are required.",
    );
  }

  if (!request.signedIntent) {
    throw new SettlementExecutionBlockedError(
      "Arc execution blocked: signedIntent is required for a live lane.",
    );
  }

  throw new SettlementExecutionBlockedError(
    "Arc live settlement remains disabled until signed-intent validation/binding, external signer, replay/idempotency, finality verification, and operator gates are implemented and approved.",
  );
}

/**
 * Compatibility dispatcher:
 * - Arc testnet is unmistakably simulated.
 * - Arc mainnet attempts the live path and therefore fails closed.
 */
export async function settleOnArc(
  request: ArcSettlementRequest,
): Promise<ArcSimulatedSettlement | ExecutedSettlement> {
  if (request.rail === "arc-testnet") {
    return simulateSettlementOnArc(request);
  }
  return executeSettlementOnArc(request);
}

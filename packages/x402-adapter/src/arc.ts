import type {
  EvmAddress,
  SettlementRailSlug,
  UsdcAmount,
} from "@agentropolis/payrail-core";
import { EVM_CHAINS } from "@agentropolis/payrail-core";

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

export interface ArcSettlementResult {
  success: boolean;
  simulatedOnly: boolean;
  rail: ArcSettlementRequest["rail"];
  chainId: number | null;
  txHash: string | null;
  receiptId: string;
  message: string;
}

/**
 * Guarded Arc adapter.
 *
 * Invariants:
 * - agents never provide private keys or mnemonics;
 * - live settlement requires an external signer and explicit approval refs;
 * - Arc testnet and mainnet metadata are compiled from current official references;
 * - metadata presence does not enable live settlement;
 * - this adapter cannot bypass FISCALITH / AEGIS / 54T / Execution Envelope gates.
 */
export async function settleOnArc(
  request: ArcSettlementRequest,
): Promise<ArcSettlementResult> {
  if (request.rail === "arc-testnet") {
    const chain = EVM_CHAINS.ARC_TESTNET;

    return {
      success: true,
      simulatedOnly: true,
      rail: request.rail,
      chainId: chain.chainId,
      txHash: null,
      receiptId: request.receiptId,
      message:
        `[SIMULATED] Arc Testnet settlement intent for $${request.amountUsdc} USDC ` +
        `to ${request.toAddress}. External signing is not enabled.`,
    };
  }

  const chain = EVM_CHAINS.ARC_MAINNET;

  // Mainnet metadata is known, but live execution remains disabled until the
  // external signer, 54T trust boundary, replay/idempotency and approval gates exist.
  if (!request.approvalRef || !request.executionEnvelopeRef || !request.aegisDecisionRef) {
    return {
      success: false,
      simulatedOnly: true,
      rail: request.rail,
      chainId: chain.chainId,
      txHash: null,
      receiptId: request.receiptId,
      message:
        "Arc mainnet blocked: approval, Execution Envelope, and AEGIS decision references are required.",
    };
  }

  return {
    success: false,
    simulatedOnly: true,
    rail: request.rail,
    chainId: chain.chainId,
    txHash: null,
    receiptId: request.receiptId,
    message:
      "Arc mainnet metadata is verified, but live settlement remains disabled until the external signer, 54T integrity, replay/idempotency and operator gates are implemented and approved.",
  };
}

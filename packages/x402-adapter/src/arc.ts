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
 * - Arc testnet is compiled from verified public network metadata;
 * - Arc mainnet metadata is operator-supplied until independently verified;
 * - this adapter cannot bypass wallet-guard / AEGIS / Execution Envelope.
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

  // Mainnet may only be activated after current network metadata is supplied by
  // trusted operator configuration and the request has passed explicit gates.
  if (!request.approvalRef || !request.executionEnvelopeRef || !request.aegisDecisionRef) {
    return {
      success: false,
      simulatedOnly: true,
      rail: request.rail,
      chainId: null,
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
    chainId: null,
    txHash: null,
    receiptId: request.receiptId,
    message:
      "Arc mainnet is configuration-only in this build. Verify current Arc mainnet network metadata and attach an external signer before enabling live settlement.",
  };
}

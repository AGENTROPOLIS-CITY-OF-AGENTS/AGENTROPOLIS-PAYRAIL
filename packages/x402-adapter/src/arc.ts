import type {
  EvmAddress,
  SettlementRailSlug,
  UsdcAmount,
} from "@agentropolis/payrail-core";
import {
  EVM_CHAINS,
  ReplayGuard,
  blockedOutcome,
  redactSecrets,
  simulatedOutcome,
  type SettlementOutcome,
  type SignedIntent,
  isSignedIntentValid,
  verifySignedIntentBinding,
} from "@agentropolis/payrail-core";

export interface ArcSettlementRequest {
  receiptId: string;
  agentId: string;
  taskId: string;
  districtId: string;
  toAddress: EvmAddress;
  amountUsdc: UsdcAmount;
  rail: Extract<SettlementRailSlug, "arc-testnet" | "arc-mainnet">;
  /** Unique idempotency key for replay protection. */
  idempotencyKey: string;
  /** Signed economic intent binding actor/mandate/amount/asset/recipient/chain/
   *  provider/feePolicy/quote/expiry/Execution Envelope/AEGIS/54T. */
  signedIntent?: SignedIntent;
  approvalRef?: string;
  executionEnvelopeRef?: string;
  aegisDecisionRef?: string;
}

export interface ArcSettlementResult {
  outcome: SettlementOutcome;
  rail: ArcSettlementRequest["rail"];
  chainId: number | null;
  receiptId: string;
}

/**
 * Module-level replay guard for the Arc rail.
 *
 * ⚠️  NON-DURABLE / NOT PRODUCTION COMPLETE — in-memory only, resets on
 * restart. Phase 1 must replace with a persistent store before live settlement.
 */
export const arcReplayGuard = new ReplayGuard();

/**
 * Guarded Arc adapter.
 *
 * Invariants:
 * - agents never provide private keys or mnemonics;
 * - live settlement requires an external signer and explicit approval refs;
 * - Arc testnet and mainnet metadata are compiled from current official references;
 * - metadata presence does not enable live settlement;
 * - this adapter cannot bypass FISCALITH / AEGIS / 54T / Execution Envelope gates;
 * - a SIMULATED outcome never carries a txHash.
 */
export async function settleOnArc(
  request: ArcSettlementRequest,
): Promise<ArcSettlementResult> {
  // Replay protection: refuse a duplicate idempotency key.
  if (arcReplayGuard.isReplay(request.idempotencyKey)) {
    return {
      outcome: blockedOutcome(
        "Replay detected: idempotency key already used.",
        "duplicate-idempotency-key",
      ),
      rail: request.rail,
      chainId: null,
      receiptId: request.receiptId,
    };
  }

  // Signed intent binding: if a signedIntent is provided, it must be valid and
  // consistent with the request. A mismatched intent is refused.
  if (request.signedIntent) {
    if (!isSignedIntentValid(request.signedIntent)) {
      return {
        outcome: blockedOutcome(
          "Signed intent is invalid (missing or inconsistent bindings).",
          "invalid-signed-intent",
        ),
        rail: request.rail,
        chainId: null,
        receiptId: request.receiptId,
      };
    }
    const mismatches = verifySignedIntentBinding(request.signedIntent, {
      actor: request.agentId,
      recipient: request.toAddress,
      chain: request.rail,
    });
    if (mismatches.length > 0) {
      return {
        outcome: blockedOutcome(
          `Signed intent binding mismatch on: ${mismatches.join(", ")}.`,
          "signed-intent-binding-mismatch",
        ),
        rail: request.rail,
        chainId: null,
        receiptId: request.receiptId,
      };
    }
  }

  if (request.rail === "arc-testnet") {
    const chain = EVM_CHAINS.ARC_TESTNET;
    const outcome = simulatedOutcome(
      redactSecrets(
        `[SIMULATED] Arc Testnet settlement intent for $${request.amountUsdc} USDC ` +
          `to ${request.toAddress}. External signing is not enabled.`,
      ),
      `sim-${request.idempotencyKey}`,
    );
    arcReplayGuard.recordIfAbsent(request.idempotencyKey, outcome);
    return {
      outcome,
      rail: request.rail,
      chainId: chain.chainId,
      receiptId: request.receiptId,
    };
  }

  const chain = EVM_CHAINS.ARC_MAINNET;

  // Mainnet metadata is known, but live execution remains disabled until the
  // external signer, 54T trust boundary, replay/idempotency and approval gates exist.
  if (!request.approvalRef || !request.executionEnvelopeRef || !request.aegisDecisionRef) {
    const outcome = blockedOutcome(
      "Arc mainnet blocked: approval, Execution Envelope, and AEGIS decision references are required.",
      "missing-approval-refs",
    );
    arcReplayGuard.recordIfAbsent(request.idempotencyKey, outcome);
    return {
      outcome,
      rail: request.rail,
      chainId: chain.chainId,
      receiptId: request.receiptId,
    };
  }

  const outcome = blockedOutcome(
    "Arc mainnet metadata is verified, but live settlement remains disabled until the external signer, 54T integrity, replay/idempotency and operator gates are implemented and approved.",
    "arc-mainnet-live-disabled",
  );
  arcReplayGuard.recordIfAbsent(request.idempotencyKey, outcome);
  return {
    outcome,
    rail: request.rail,
    chainId: chain.chainId,
    receiptId: request.receiptId,
  };
}

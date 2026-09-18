// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — chain-router
//
// Consumes Genesis Spawn / XENTS Capital Grid chain-route decisions.
// It does NOT decide whether a token should exist, authorize treasury spend,
// select a chain without an upstream decision, or hold signing credentials.
// ---------------------------------------------------------------------------

export type AdapterStatus =
  | "production"
  | "testnet"
  | "testnet-in-pr"
  | "dry-run-default-lane"
  | "candidate"
  | "planned"
  | "not-implemented"
  | "blocked";

export interface ChainRouteCandidate {
  chainId: string;
  score: number;
  missingRequired: string[];
  settlementAdapterStatus: AdapterStatus | string;
  tokenLaunchAdapterStatus: AdapterStatus | string;
  executionEligible: boolean;
  reasons?: string[];
}

export interface ChainRouteDecision {
  decisionId: string;
  requestId: string;
  projectId: string;
  rankedCandidates: ChainRouteCandidate[];
  selectedChainId: string | null;
  executionAuthorized: boolean;
  authorityRefs: {
    genesisSpawn: string;
    aegis: string;
    launchEscrow: string;
  };
  receiptRequired: true;
}

export interface PayrailRouteGateInput {
  decision: ChainRouteDecision;
  purpose: "settlement" | "agent-commerce" | "machine-commerce";
  requireProductionAdapter?: boolean;
}

export interface PayrailRouteGateResult {
  allowed: boolean;
  selectedChainId: string | null;
  reason:
    | "allowed"
    | "no-selected-chain"
    | "execution-not-authorized"
    | "missing-authority-reference"
    | "candidate-not-found"
    | "candidate-not-execution-eligible"
    | "settlement-adapter-not-production";
}

/**
 * PAYRAIL gate for an already-produced Genesis Spawn chain decision.
 *
 * This function intentionally does not rank chains. Ranking belongs upstream
 * to the Chain Oracle. PAYRAIL only checks whether the selected settlement
 * route may proceed under the supplied decision.
 */
export function gateSettlementRoute(
  input: PayrailRouteGateInput
): PayrailRouteGateResult {
  const { decision } = input;

  if (!decision.selectedChainId) {
    return { allowed: false, selectedChainId: null, reason: "no-selected-chain" };
  }

  if (!decision.executionAuthorized) {
    return {
      allowed: false,
      selectedChainId: decision.selectedChainId,
      reason: "execution-not-authorized",
    };
  }

  const refs = decision.authorityRefs;
  if (!refs?.genesisSpawn || !refs?.aegis || !refs?.launchEscrow) {
    return {
      allowed: false,
      selectedChainId: decision.selectedChainId,
      reason: "missing-authority-reference",
    };
  }

  const candidate = decision.rankedCandidates.find(
    (item) => item.chainId === decision.selectedChainId
  );

  if (!candidate) {
    return {
      allowed: false,
      selectedChainId: decision.selectedChainId,
      reason: "candidate-not-found",
    };
  }

  if (!candidate.executionEligible || candidate.missingRequired.length > 0) {
    return {
      allowed: false,
      selectedChainId: decision.selectedChainId,
      reason: "candidate-not-execution-eligible",
    };
  }

  if (
    input.requireProductionAdapter &&
    candidate.settlementAdapterStatus !== "production"
  ) {
    return {
      allowed: false,
      selectedChainId: decision.selectedChainId,
      reason: "settlement-adapter-not-production",
    };
  }

  return {
    allowed: true,
    selectedChainId: decision.selectedChainId,
    reason: "allowed",
  };
}

/**
 * Returns a PAYRAIL-safe view of candidates for diagnostics and operator UI.
 * No wallet addresses, keys, RPC secrets, or signing material belong here.
 */
export function summarizeSettlementCandidates(decision: ChainRouteDecision) {
  return decision.rankedCandidates.map((candidate) => ({
    chainId: candidate.chainId,
    score: candidate.score,
    settlementAdapterStatus: candidate.settlementAdapterStatus,
    executionEligible: candidate.executionEligible,
    missingRequired: [...candidate.missingRequired],
  }));
}

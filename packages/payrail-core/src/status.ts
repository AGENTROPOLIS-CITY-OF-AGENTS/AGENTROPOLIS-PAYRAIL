// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — payrail-core / status
// ---------------------------------------------------------------------------

export type SettlementStatus =
  | "SIMULATED"
  | "PENDING"
  | "SETTLED"
  | "BLOCKED"
  | "FAILED";

export interface SimulatedOutcome {
  status: "SIMULATED";
  simulatedOnly: true;
  message: string;
  simulationRef?: string;
}

export interface PendingOutcome {
  status: "PENDING";
  message: string;
  txHash?: string;
}

export interface SettledOutcome {
  status: "SETTLED";
  message: string;
  txHash: string;
}

export interface BlockedOutcome {
  status: "BLOCKED";
  message: string;
  reason: string;
}

export interface FailedOutcome {
  status: "FAILED";
  message: string;
  reason: string;
}

export type SettlementOutcome =
  | SimulatedOutcome
  | PendingOutcome
  | SettledOutcome
  | BlockedOutcome
  | FailedOutcome;

function requireNonEmptyTxHash(txHash: string): string {
  if (typeof txHash !== "string" || txHash.trim().length === 0) {
    throw new Error("txHash must be a non-empty string");
  }
  return txHash;
}

export function simulatedOutcome(message: string, simulationRef?: string): SimulatedOutcome {
  return { status: "SIMULATED", simulatedOnly: true, message, simulationRef };
}

export function pendingOutcome(message: string, txHash?: string): PendingOutcome {
  if (txHash !== undefined) requireNonEmptyTxHash(txHash);
  return txHash === undefined
    ? { status: "PENDING", message }
    : { status: "PENDING", message, txHash };
}

export function settledOutcome(message: string, txHash: string): SettledOutcome {
  return { status: "SETTLED", message, txHash: requireNonEmptyTxHash(txHash) };
}

export function blockedOutcome(message: string, reason: string): BlockedOutcome {
  return { status: "BLOCKED", message, reason };
}

export function failedOutcome(message: string, reason: string): FailedOutcome {
  return { status: "FAILED", message, reason };
}

export function isSimulated(outcome: SettlementOutcome): outcome is SimulatedOutcome {
  return outcome.status === "SIMULATED";
}

export function hasTxHash(
  outcome: SettlementOutcome,
): outcome is SettledOutcome | (PendingOutcome & { txHash: string }) {
  if (outcome.status === "SETTLED") return outcome.txHash.trim().length > 0;
  if (outcome.status === "PENDING") {
    return typeof outcome.txHash === "string" && outcome.txHash.trim().length > 0;
  }
  return false;
}

export function getTxHash(outcome: SettlementOutcome): string | undefined {
  return hasTxHash(outcome) ? outcome.txHash : undefined;
}

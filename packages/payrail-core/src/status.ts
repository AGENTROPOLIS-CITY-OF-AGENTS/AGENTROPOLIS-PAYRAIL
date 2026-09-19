// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — payrail-core / status
//
// Unambiguous settlement outcome shapes.
//
// The legacy `success: boolean` result shape is ambiguous and is replaced by
// a discriminated union of explicit states:
//
//   SIMULATED  — a dry-run / mock result. NEVER carries a txHash.
//   PENDING    — submitted, awaiting confirmation. May carry a txHash.
//   SETTLED    — finality confirmed. Carries a txHash.
//   BLOCKED    — refused by policy / authority / integrity checks. No txHash.
//   FAILED     — execution failed. No txHash.
//
// Invariant: a SIMULATED outcome MUST NOT include a txHash. This is enforced
// by the type (the SIMULATED variant has no txHash field) and by tests.
// ---------------------------------------------------------------------------

/** Canonical settlement status vocabulary. */
export type SettlementStatus =
  | "SIMULATED"
  | "PENDING"
  | "SETTLED"
  | "BLOCKED"
  | "FAILED";

/** A simulated (dry-run / mock) outcome. Deliberately has NO txHash field. */
export interface SimulatedOutcome {
  status: "SIMULATED";
  simulatedOnly: true;
  message: string;
  /** Present only for audit/attribution, never a real on-chain hash. */
  simulationRef?: string;
}

/** A submitted-but-unconfirmed outcome. May carry a txHash. */
export interface PendingOutcome {
  status: "PENDING";
  message: string;
  txHash?: string;
}

/** A finality-confirmed outcome. Carries a txHash. */
export interface SettledOutcome {
  status: "SETTLED";
  message: string;
  txHash: string;
}

/** A policy / authority / integrity refusal. No txHash. */
export interface BlockedOutcome {
  status: "BLOCKED";
  message: string;
  reason: string;
}

/** An execution failure. No txHash. */
export interface FailedOutcome {
  status: "FAILED";
  message: string;
  reason: string;
}

/** Discriminated union of all settlement outcomes. */
export type SettlementOutcome =
  | SimulatedOutcome
  | PendingOutcome
  | SettledOutcome
  | BlockedOutcome
  | FailedOutcome;

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export function simulatedOutcome(message: string, simulationRef?: string): SimulatedOutcome {
  return { status: "SIMULATED", simulatedOnly: true, message, simulationRef };
}

export function pendingOutcome(message: string, txHash?: string): PendingOutcome {
  return { status: "PENDING", message, txHash };
}

export function settledOutcome(message: string, txHash: string): SettledOutcome {
  return { status: "SETTLED", message, txHash };
}

export function blockedOutcome(message: string, reason: string): BlockedOutcome {
  return { status: "BLOCKED", message, reason };
}

export function failedOutcome(message: string, reason: string): FailedOutcome {
  return { status: "FAILED", message, reason };
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** True if the outcome is a simulated (dry-run) result. */
export function isSimulated(outcome: SettlementOutcome): outcome is SimulatedOutcome {
  return outcome.status === "SIMULATED";
}

/** True if the outcome carries a real on-chain txHash. */
export function hasTxHash(outcome: SettlementOutcome): outcome is SettledOutcome | PendingOutcome {
  return outcome.status === "SETTLED" || outcome.status === "PENDING";
}

/**
 * Extract the txHash if present, else undefined.
 * A SIMULATED outcome always returns undefined — it never carries a txHash.
 */
export function getTxHash(outcome: SettlementOutcome): string | undefined {
  if (outcome.status === "SETTLED" || outcome.status === "PENDING") {
    return outcome.txHash;
  }
  return undefined;
}

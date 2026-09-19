// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — receipt-engine
// Creates, validates, and stores auditable task receipts.
//
// Receipts are immutable records. Once issued, they are never modified.
// Settled receipts include a tx hash from the x402-adapter (Phase 2).
//
// The receipt status uses the canonical SettlementStatus vocabulary
// (SIMULATED / PENDING / SETTLED / BLOCKED / FAILED). A SIMULATED receipt
// NEVER carries a txHash.
// ---------------------------------------------------------------------------

import {
  generateId,
  formatTimestamp,
  type AgentId,
  type DistrictId,
  type TaskId,
  type ReceiptId,
  type UsdcMinorUnitString,
  formatUsdcMinorUnitString,
  type SettlementStatus,
} from "@agentropolis/payrail-core";

export const RECEIPT_SCHEMA_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Receipt type
// ---------------------------------------------------------------------------

export type ReceiptStatus = SettlementStatus | "CANCELLED";

/** Settlement evidence attached to a receipt. */
export interface ReceiptSettlement {
  status: SettlementStatus;
  /** Present only for PENDING / SETTLED. A SIMULATED receipt never has one. */
  txHash?: string;
  settledAt?: string;
}

export interface AgentTaskReceipt {
  receiptId: ReceiptId;
  schemaVersion: typeof RECEIPT_SCHEMA_VERSION;
  taskId: TaskId;
  agentId: AgentId;
  districtId: DistrictId;
  taskType: string;
  description: string;
  amountMinorUnits: UsdcMinorUnitString;
  currency: "USDC";
  status: ReceiptStatus;
  dryRun: boolean;
  /** Settlement evidence. txHash is absent for SIMULATED / BLOCKED / FAILED. */
  settlement: ReceiptSettlement | null;
  policyId?: string;
  issuedAt: string;
  metadata?: Record<string, unknown>;
}

export interface CreateReceiptInput {
  taskId: TaskId;
  agentId: AgentId;
  districtId: DistrictId;
  taskType: string;
  description: string;
  amountMinorUnits: UsdcMinorUnitString;
  status: ReceiptStatus;
  dryRun: boolean;
  policyId?: string;
  settlement?: ReceiptSettlement;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// In-memory store (Phase 1: replace with DB)
// ---------------------------------------------------------------------------

/** TODO: Phase 1 — replace in-memory store with SQLite / Postgres persistence */
const receiptStore = new Map<ReceiptId, AgentTaskReceipt>();

console.warn(
  "[receipt-engine] WARNING: Using in-memory receipt store. All receipts are lost on restart. " +
    "Replace with persistent storage in Phase 1.",
);

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Create and store a new receipt for an agent task payment.
 * This is the only way to produce a receipt — never construct one manually.
 */
export function createReceipt(input: CreateReceiptInput): AgentTaskReceipt {
  const receiptId = generateId("rcpt") as ReceiptId;
  const now = formatTimestamp(new Date());

  const receipt: AgentTaskReceipt = {
    receiptId,
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    taskId: input.taskId,
    agentId: input.agentId,
    districtId: input.districtId,
    taskType: input.taskType,
    description: input.description,
    amountMinorUnits: input.amountMinorUnits,
    currency: "USDC",
    status: input.status,
    dryRun: input.dryRun,
    settlement: input.settlement ?? null,
    policyId: input.policyId,
    issuedAt: now,
    metadata: input.metadata,
  };

  receiptStore.set(receiptId, receipt);
  return receipt;
}

/**
 * Retrieve a receipt by ID.
 */
export function getReceipt(receiptId: ReceiptId): AgentTaskReceipt | undefined {
  return receiptStore.get(receiptId);
}

/**
 * Mark a receipt as settled (called after x402 on-chain confirmation).
 * TODO: Phase 2 — called by x402-adapter after settlement confirmation
 */
export function markSettled(receiptId: ReceiptId, txHash: string): AgentTaskReceipt {
  const receipt = receiptStore.get(receiptId);
  if (!receipt) {
    throw new Error(`Receipt not found: ${receiptId}`);
  }
  const settled: AgentTaskReceipt = {
    ...receipt,
    status: "SETTLED",
    settlement: {
      status: "SETTLED",
      txHash,
      settledAt: formatTimestamp(new Date()),
    },
  };
  receiptStore.set(receiptId, settled);
  return settled;
}

/**
 * List all receipts (for audit/dashboard use).
 * TODO: Phase 1 — add filtering by agentId, districtId, date range
 */
export function listReceipts(): AgentTaskReceipt[] {
  return Array.from(receiptStore.values());
}

/**
 * Print a receipt to console in a structured, human-readable format.
 */
export function printReceipt(receipt: AgentTaskReceipt): void {
  const dryTag = receipt.dryRun ? " [DRY-RUN]" : "";
  const txHash = receipt.settlement?.txHash ?? "—";
  console.log("─────────────────────────────────────────");
  console.log(`AGENTROPOLIS-PAYRAIL RECEIPT${dryTag}`);
  console.log("─────────────────────────────────────────");
  console.log(`Receipt ID:   ${receipt.receiptId}`);
  console.log(`Task ID:      ${receipt.taskId}`);
  console.log(`Agent:        ${receipt.agentId}`);
  console.log(`District:     ${receipt.districtId}`);
  console.log(`Task Type:    ${receipt.taskType}`);
  console.log(`Description:  ${receipt.description}`);
  console.log(`Amount:       ${formatUsdcMinorUnitString(receipt.amountMinorUnits)} ${receipt.currency}`);
  console.log(`Status:       ${receipt.status}`);
  console.log(`TX Hash:      ${txHash}`);
  console.log(`Issued At:    ${receipt.issuedAt}`);
  console.log("─────────────────────────────────────────");
}

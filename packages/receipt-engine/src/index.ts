// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — receipt-engine
// Exact-money, execution-mode-aware task receipts.
// ---------------------------------------------------------------------------

import {
  formatTimestamp,
  formatUsdc,
  generateId,
  type AgentId,
  type DistrictId,
  type ExecutedSettlement,
  type ReceiptId,
  type TaskId,
  type UsdcAmount,
} from "@agentropolis/payrail-core";

export const RECEIPT_SCHEMA_VERSION = "1.1.0";

export type ReceiptStatus =
  | "dry-run-accepted"
  | "pending-approval"
  | "settled"
  | "failed"
  | "cancelled";

export interface AgentTaskReceipt {
  receiptId: ReceiptId;
  schemaVersion: typeof RECEIPT_SCHEMA_VERSION;
  taskId: TaskId;
  agentId: AgentId;
  districtId: DistrictId;
  taskType: string;
  description: string;
  /** Exact decimal string, never a JavaScript floating-point number. */
  amountUsdc: string;
  currency: "USDC";
  status: ReceiptStatus;
  dryRun: boolean;
  executionMode: "simulated" | "live";
  settlementTxHash: string | null;
  policyId?: string;
  issuedAt: string;
  settledAt: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateReceiptInput {
  taskId: TaskId;
  agentId: AgentId;
  districtId: DistrictId;
  taskType: string;
  description: string;
  amountUsdc: UsdcAmount;
  status: Exclude<ReceiptStatus, "settled">;
  dryRun: boolean;
  policyId?: string;
  metadata?: Record<string, unknown>;
}

const receiptStore = new Map<ReceiptId, AgentTaskReceipt>();

console.warn(
  "[receipt-engine] WARNING: Using in-memory receipt store. " +
    "Replace with persistent storage before production use.",
);

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
    amountUsdc: formatUsdc(input.amountUsdc),
    currency: "USDC",
    status: input.status,
    dryRun: input.dryRun,
    executionMode: "simulated",
    settlementTxHash: null,
    policyId: input.policyId,
    issuedAt: now,
    settledAt: null,
    metadata: input.metadata,
  };

  receiptStore.set(receiptId, receipt);
  return receipt;
}

export function getReceipt(receiptId: ReceiptId): AgentTaskReceipt | undefined {
  return receiptStore.get(receiptId);
}

/**
 * Only a branded ExecutedSettlement can promote a receipt to settled/live.
 * Simulated outcomes are not assignable to this parameter at compile time.
 */
export function markSettled(
  receiptId: ReceiptId,
  settlement: ExecutedSettlement,
): AgentTaskReceipt {
  const receipt = receiptStore.get(receiptId);
  if (!receipt) throw new Error(`Receipt not found: ${receiptId}`);
  if (settlement.receiptId !== receiptId) {
    throw new Error("Settlement receiptId does not match receipt being promoted");
  }
  if (settlement.executionMode !== "live" || settlement.kind !== "executed") {
    throw new Error("Only live executed settlements can mark a receipt settled");
  }

  const settled: AgentTaskReceipt = {
    ...receipt,
    status: "settled",
    dryRun: false,
    executionMode: "live",
    settlementTxHash: settlement.txHash,
    settledAt: formatTimestamp(new Date()),
  };

  receiptStore.set(receiptId, settled);
  return settled;
}

export function listReceipts(): AgentTaskReceipt[] {
  return Array.from(receiptStore.values());
}

export function printReceipt(receipt: AgentTaskReceipt): void {
  const dryTag = receipt.executionMode === "simulated" ? " [SIMULATED]" : "";
  console.log("─────────────────────────────────────────");
  console.log(`AGENTROPOLIS-PAYRAIL RECEIPT${dryTag}`);
  console.log("─────────────────────────────────────────");
  console.log(`Receipt ID:   ${receipt.receiptId}`);
  console.log(`Task ID:      ${receipt.taskId}`);
  console.log(`Agent:        ${receipt.agentId}`);
  console.log(`District:     ${receipt.districtId}`);
  console.log(`Task Type:    ${receipt.taskType}`);
  console.log(`Description:  ${receipt.description}`);
  console.log(`Amount:       $${receipt.amountUsdc} ${receipt.currency}`);
  console.log(`Status:       ${receipt.status}`);
  console.log(`Mode:         ${receipt.executionMode}`);
  console.log(`TX Hash:      ${receipt.settlementTxHash ?? "—"}`);
  console.log(`Issued At:    ${receipt.issuedAt}`);
  console.log(`Settled At:   ${receipt.settledAt ?? "—"}`);
  console.log("─────────────────────────────────────────");
}

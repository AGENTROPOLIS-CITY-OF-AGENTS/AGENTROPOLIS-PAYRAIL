import type { SettlementRailSlug } from "@agentropolis/payrail-core";

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

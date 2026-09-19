// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — Recipe: Whale Watcher 54
//
// Watches mock wallet activity in the Harbor district.
// When a transaction exceeds the configured threshold, it:
//   1. Creates a mock alert
//   2. Evaluates the wallet-guard policy (dry-run)
//   3. Logs a mock receipt via receipt-engine
//
// ⚠️  No real funds are moved.
// ⚠️  No real wallet addresses are monitored.
// ⚠️  No private keys are handled — "No agent gets raw wallet power."
//
// TODO: Phase 2 — replace mock wallet events with real chain indexer
// TODO: Phase 2 — connect x402-adapter for real payment after approval
// ---------------------------------------------------------------------------

import {
  DISTRICTS,
  formatTimestamp,
  generateId,
  type AgentId,
  type DistrictId,
  type TaskId,
  formatUsdcMinorUnitString,
  usdcMinorUnitString,
} from "@agentropolis/payrail-core";

import {
  evaluatePolicy,
  type WalletGuardPolicy,
} from "@agentropolis/wallet-guard";

import {
  createReceipt,
  printReceipt,
} from "@agentropolis/receipt-engine";

import { lookupPrice } from "@agentropolis/pricing-rules";

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------

const AGENT_ID = "whale-watcher-54" as AgentId;
const DISTRICT_ID = DISTRICTS.HARBOR;
const TASK_TYPE = "whale-alert";

// ---------------------------------------------------------------------------
// Policy (dry-run — safe defaults)
// ---------------------------------------------------------------------------

const POLICY: WalletGuardPolicy = {
  policyId: "whale-watcher-54-policy",
  agentId: AGENT_ID,
  maxSpendPerTaskMinorUnits: usdcMinorUnitString("50000"),
  maxSpendPerDayMinorUnits: usdcMinorUnitString("500000"),
  approvalThresholdMinorUnits: usdcMinorUnitString("40000"),
  allowedDistricts: [DISTRICTS.HARBOR, DISTRICTS.DOWNTOWN],
  blockedDistricts: ["dark-alley"],
  dryRun: true, // Always true for this recipe — no real funds
  notes: "Whale Watcher 54 dry-run policy. Phase 0 MVP.",
};

// ---------------------------------------------------------------------------
// Mock wallet event types
// ---------------------------------------------------------------------------

interface WalletEvent {
  eventId: string;
  walletAddress: string;
  amountUsdc: number;
  direction: "inbound" | "outbound";
  timestamp: string;
  districtId: DistrictId;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Mock wallet event source
// Simulates 5 wallet events — no real blockchain interaction.
// TODO: Phase 2 — replace with real chain indexer / webhook listener
// ---------------------------------------------------------------------------

function generateMockWalletEvents(): WalletEvent[] {
  const now = new Date();
  return [
    {
      eventId: generateId("evt"),
      walletAddress: "0xMOCK_HARBOR_WALLET_001",
      amountUsdc: 0.003,
      direction: "outbound",
      timestamp: formatTimestamp(new Date(now.getTime() - 300_000)),
      districtId: DISTRICTS.HARBOR,
      notes: "Small task payment — below threshold",
    },
    {
      eventId: generateId("evt"),
      walletAddress: "0xMOCK_HARBOR_WALLET_002",
      amountUsdc: 150.0,
      direction: "inbound",
      timestamp: formatTimestamp(new Date(now.getTime() - 240_000)),
      districtId: DISTRICTS.HARBOR,
      notes: "WHALE DETECTED — large inbound transfer",
    },
    {
      eventId: generateId("evt"),
      walletAddress: "0xMOCK_HARBOR_WALLET_003",
      amountUsdc: 0.001,
      direction: "outbound",
      timestamp: formatTimestamp(new Date(now.getTime() - 180_000)),
      districtId: DISTRICTS.HARBOR,
      notes: "Micro-payment for data lookup",
    },
    {
      eventId: generateId("evt"),
      walletAddress: "0xMOCK_HARBOR_WALLET_004",
      amountUsdc: 500.0,
      direction: "outbound",
      timestamp: formatTimestamp(new Date(now.getTime() - 120_000)),
      districtId: DISTRICTS.HARBOR,
      notes: "WHALE DETECTED — very large outbound transfer",
    },
    {
      eventId: generateId("evt"),
      walletAddress: "0xMOCK_HARBOR_WALLET_005",
      amountUsdc: 0.012,
      direction: "inbound",
      timestamp: formatTimestamp(new Date(now.getTime() - 60_000)),
      districtId: DISTRICTS.HARBOR,
      notes: "Normal agent micropayment",
    },
  ];
}

// ---------------------------------------------------------------------------
// Alert types
// ---------------------------------------------------------------------------

interface WhaleAlert {
  alertId: string;
  walletAddress: string;
  amountUsdc: number;
  direction: "inbound" | "outbound";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  timestamp: string;
  mock: true; // Always flagged — this is never a real alert yet
}

const WHALE_THRESHOLD_USDC = 100;

function classifySeverity(amount: number): WhaleAlert["severity"] {
  if (amount >= 10_000) return "critical";
  if (amount >= 1_000) return "high";
  if (amount >= WHALE_THRESHOLD_USDC) return "medium";
  return "low";
}

function createWhaleAlert(event: WalletEvent): WhaleAlert {
  const severity = classifySeverity(event.amountUsdc);
  return {
    alertId: generateId("alert"),
    walletAddress: event.walletAddress,
    amountUsdc: event.amountUsdc,
    direction: event.direction,
    severity,
    message: `[MOCK] Whale activity detected in ${event.districtId}: ${event.direction} $${event.amountUsdc} USDC from ${event.walletAddress}`,
    timestamp: event.timestamp,
    mock: true,
  };
}

// ---------------------------------------------------------------------------
// Main recipe logic
// ---------------------------------------------------------------------------

async function runWhaleWatcher54(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  AGENTROPOLIS-PAYRAIL — Recipe: Whale Watcher 54");
  console.log("  District: Harbor | Mode: DRY-RUN | Phase: 0 (MVP)");
  console.log("  No agent gets raw wallet power.");
  console.log("═══════════════════════════════════════════════════════");
  console.log();

  const events = generateMockWalletEvents();
  console.log(`[whale-watcher-54] Scanning ${events.length} mock wallet events...\n`);

  // Look up the pricing rule for this task type
  const priceInfo = lookupPrice(DISTRICT_ID, TASK_TYPE);
  const taskPriceMinorUnits =
    priceInfo?.effectivePriceMinorUnits ?? usdcMinorUnitString("10000");
  console.log(
    `[whale-watcher-54] Task fee: ${formatUsdcMinorUnitString(taskPriceMinorUnits)} USDC per alert (rule: ${priceInfo?.rule.ruleId ?? "default"})\n`
  );

  let alertsCreated = 0;

  for (const event of events) {
    // Only fire alerts for whale-threshold crossings
    if (event.amountUsdc < WHALE_THRESHOLD_USDC) {
      console.log(
        `[whale-watcher-54] ${event.eventId} — $${event.amountUsdc} USDC — below threshold, skip`
      );
      continue;
    }

    // Create mock alert
    const alert = createWhaleAlert(event);
    console.log(`\n[whale-watcher-54] 🐋 WHALE ALERT [${alert.severity.toUpperCase()}]`);
    console.log(`  Alert ID:  ${alert.alertId}`);
    console.log(`  Wallet:    ${alert.walletAddress}`);
    console.log(`  Amount:    $${alert.amountUsdc} USDC (${alert.direction})`);
    console.log(`  Message:   ${alert.message}`);

    // Evaluate wallet-guard policy for the alert task fee
    const taskId = generateId("task") as TaskId;
    const decision = evaluatePolicy(
      {
        agentId: AGENT_ID,
        districtId: DISTRICT_ID,
        taskId,
        taskType: TASK_TYPE,
        amountMinorUnits: taskPriceMinorUnits,
        description: `Whale alert for ${alert.walletAddress}`,
        dryRun: POLICY.dryRun,
        requestedAt: formatTimestamp(new Date()),
        metadata: { alertId: alert.alertId, severity: alert.severity },
      },
      POLICY
    );

    console.log(`  Policy:    ${decision.reason}`);

    if (!decision.allowed) {
      console.log(`  [BLOCKED] Task fee blocked by wallet-guard. No receipt issued.`);
      continue;
    }

    // Create mock receipt
    const receipt = createReceipt({
      taskId,
      agentId: AGENT_ID,
      districtId: DISTRICT_ID,
      taskType: TASK_TYPE,
      description: `[MOCK] Whale alert — ${alert.severity} — $${alert.amountUsdc} USDC ${alert.direction} on ${alert.walletAddress}`,
      amountMinorUnits: taskPriceMinorUnits,
      status: "SIMULATED",
      dryRun: true,
      policyId: POLICY.policyId,
      metadata: {
        alertId: alert.alertId,
        walletAddress: alert.walletAddress,
        whaleAmountUsdc: alert.amountUsdc,
        direction: alert.direction,
        severity: alert.severity,
      },
    });

    console.log();
    printReceipt(receipt);

    // TODO: Phase 2 — send real x402 payment for this alert task
    // const settlement = await settle({ receiptId: receipt.receiptId, ... });

    alertsCreated++;
  }

  console.log();
  console.log("═══════════════════════════════════════════════════════");
  console.log(`[whale-watcher-54] Done. Alerts fired: ${alertsCreated}`);
  console.log(`[whale-watcher-54] All receipts are DRY-RUN only. No real funds moved.`);
  console.log(`[whale-watcher-54] TODO: Phase 2 — wire x402-adapter for real settlement`);
  console.log("═══════════════════════════════════════════════════════");
}

// Entry point
runWhaleWatcher54().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error("[whale-watcher-54] Fatal error:", message);
  if (stack) console.error(stack);
  process.exit(1);
});

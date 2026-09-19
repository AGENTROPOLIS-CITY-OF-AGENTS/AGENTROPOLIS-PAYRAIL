// AGENTROPOLIS-PAYRAIL — wallet-guard
// Integer-only policy engine. No floating-point money is accepted anywhere.

import type {
  PaymentRequest,
  UsdcMinorUnitString,
} from "@agentropolis/payrail-core";
import {
  formatUsdcMinorUnitString,
  usdcMinorUnitBigInt,
  usdcMinorUnitString,
} from "@agentropolis/payrail-core";

export interface WalletGuardPolicy {
  policyId: string;
  agentId: string;
  maxSpendPerTaskMinorUnits: UsdcMinorUnitString;
  maxSpendPerDayMinorUnits: UsdcMinorUnitString;
  approvalThresholdMinorUnits: UsdcMinorUnitString;
  allowedDistricts: string[];
  blockedDistricts: string[];
  dryRun: boolean;
  notes?: string;
}

export type GuardDecision =
  | { allowed: true; requiresApproval: false; status: "SIMULATED"; reason: string }
  | { allowed: true; requiresApproval: false; status: "PENDING"; reason: string }
  | { allowed: true; requiresApproval: true; status: "PENDING"; reason: string }
  | { allowed: false; requiresApproval: false; status: "BLOCKED"; reason: string };

const dailySpendTracker = new Map<string, { totalMinorUnits: bigint; date: string }>();

console.warn(
  "[wallet-guard] WARNING: Using in-memory daily spend tracker. " +
    "Limits reset on restart — replace with persistent storage before production use.",
);

function getDailySpendMinorUnits(agentId: string): bigint {
  const today = new Date().toISOString().slice(0, 10);
  const entry = dailySpendTracker.get(agentId);
  if (!entry || entry.date !== today) return 0n;
  return entry.totalMinorUnits;
}

function recordDailySpend(agentId: string, amountMinorUnits: bigint): void {
  const today = new Date().toISOString().slice(0, 10);
  const existing = dailySpendTracker.get(agentId);
  if (!existing || existing.date !== today) {
    dailySpendTracker.set(agentId, { totalMinorUnits: amountMinorUnits, date: today });
  } else {
    dailySpendTracker.set(agentId, {
      totalMinorUnits: existing.totalMinorUnits + amountMinorUnits,
      date: today,
    });
  }
}

function display(value: UsdcMinorUnitString): string {
  return formatUsdcMinorUnitString(value);
}

export function evaluatePolicy(
  request: PaymentRequest,
  policy: WalletGuardPolicy,
): GuardDecision {
  const { amountMinorUnits, districtId, agentId } = request;
  const amount = usdcMinorUnitBigInt(amountMinorUnits);
  const perTask = usdcMinorUnitBigInt(policy.maxSpendPerTaskMinorUnits);
  const dailyMax = usdcMinorUnitBigInt(policy.maxSpendPerDayMinorUnits);
  const approval = usdcMinorUnitBigInt(policy.approvalThresholdMinorUnits);

  if (policy.dryRun) {
    return {
      allowed: true,
      requiresApproval: false,
      status: "SIMULATED",
      reason: `[DRY-RUN] Policy evaluated. No funds moved. Amount: $${display(amountMinorUnits)} USDC`,
    };
  }

  if (policy.blockedDistricts.includes(districtId)) {
    return {
      allowed: false,
      requiresApproval: false,
      status: "BLOCKED",
      reason: `District "${districtId}" is blocked by policy "${policy.policyId}"`,
    };
  }

  if (
    !policy.allowedDistricts.includes("*") &&
    !policy.allowedDistricts.includes(districtId)
  ) {
    return {
      allowed: false,
      requiresApproval: false,
      status: "BLOCKED",
      reason: `District "${districtId}" is not in the allowed list for policy "${policy.policyId}"`,
    };
  }

  if (amount > perTask) {
    return {
      allowed: false,
      requiresApproval: false,
      status: "BLOCKED",
      reason: `Amount $${display(amountMinorUnits)} exceeds per-task limit of $${display(policy.maxSpendPerTaskMinorUnits)} USDC`,
    };
  }

  const currentDaily = getDailySpendMinorUnits(agentId);
  if (currentDaily + amount > dailyMax) {
    return {
      allowed: false,
      requiresApproval: false,
      status: "BLOCKED",
      reason:
        `Daily limit exceeded. Current: $${formatUsdcMinorUnitString(usdcMinorUnitString(currentDaily))}, ` +
        `requested: $${display(amountMinorUnits)}, limit: $${display(policy.maxSpendPerDayMinorUnits)}`,
    };
  }

  if (amount >= approval) {
    return {
      allowed: true,
      requiresApproval: true,
      status: "PENDING",
      reason: `Amount $${display(amountMinorUnits)} meets or exceeds approval threshold of $${display(policy.approvalThresholdMinorUnits)}. Human approval required.`,
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    status: "PENDING",
    reason: `Policy "${policy.policyId}" approved $${display(amountMinorUnits)} USDC for agent "${agentId}" in district "${districtId}"`,
  };
}

export function recordSettlement(
  agentId: string,
  amountMinorUnits: UsdcMinorUnitString,
): void {
  recordDailySpend(agentId, usdcMinorUnitBigInt(amountMinorUnits));
}

export const DEFAULT_DEV_POLICY: WalletGuardPolicy = {
  policyId: "dev-default",
  agentId: "*",
  maxSpendPerTaskMinorUnits: usdcMinorUnitString("100000"),
  maxSpendPerDayMinorUnits: usdcMinorUnitString("1000000"),
  approvalThresholdMinorUnits: usdcMinorUnitString("50000"),
  allowedDistricts: ["*"],
  blockedDistricts: ["dark-alley"],
  dryRun: true,
  notes: "Default development policy — dry-run only. No real funds move.",
};

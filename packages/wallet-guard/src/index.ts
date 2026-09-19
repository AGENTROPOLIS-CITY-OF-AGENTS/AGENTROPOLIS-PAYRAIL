// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — wallet-guard
// Exact-money policy engine. No private keys or signing material live here.
// ---------------------------------------------------------------------------

import {
  ZERO_USDC,
  addUsdc,
  formatUsdc,
  parseUsdc,
  type PaymentRequest,
  type UsdcAmount,
} from "@agentropolis/payrail-core";

export interface WalletGuardPolicy {
  policyId: string;
  agentId: string;
  maxSpendPerTaskUsdc: UsdcAmount;
  maxSpendPerDayUsdc: UsdcAmount;
  approvalThresholdUsdc: UsdcAmount;
  allowedDistricts: string[];
  blockedDistricts: string[];
  dryRun: boolean;
  notes?: string;
}

export type GuardDecision =
  | { allowed: true; requiresApproval: false; reason: string }
  | { allowed: true; requiresApproval: true; reason: string }
  | { allowed: false; requiresApproval: false; reason: string };

const dailySpendTracker = new Map<string, { total: UsdcAmount; date: string }>();

console.warn(
  "[wallet-guard] WARNING: Using in-memory daily spend tracker. " +
    "Limits reset on restart — replace before production use.",
);

function getDailySpend(agentId: string): UsdcAmount {
  const today = new Date().toISOString().slice(0, 10);
  const entry = dailySpendTracker.get(agentId);
  if (!entry || entry.date !== today) return ZERO_USDC;
  return entry.total;
}

function recordDailySpend(agentId: string, amount: UsdcAmount): void {
  const today = new Date().toISOString().slice(0, 10);
  const existing = dailySpendTracker.get(agentId);
  if (!existing || existing.date !== today) {
    dailySpendTracker.set(agentId, { total: amount, date: today });
  } else {
    dailySpendTracker.set(agentId, {
      total: addUsdc(existing.total, amount),
      date: today,
    });
  }
}

export function evaluatePolicy(
  request: PaymentRequest,
  policy: WalletGuardPolicy,
): GuardDecision {
  const { amountUsdc, districtId, agentId } = request;

  if (policy.dryRun) {
    return {
      allowed: true,
      requiresApproval: false,
      reason:
        `[DRY-RUN] Policy evaluated. No funds moved. Amount: $${formatUsdc(amountUsdc)} USDC`,
    };
  }

  if (policy.blockedDistricts.includes(districtId)) {
    return {
      allowed: false,
      requiresApproval: false,
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
      reason: `District "${districtId}" is not allowed by policy "${policy.policyId}"`,
    };
  }

  if (amountUsdc > policy.maxSpendPerTaskUsdc) {
    return {
      allowed: false,
      requiresApproval: false,
      reason:
        `Amount $${formatUsdc(amountUsdc)} exceeds per-task limit of $` +
        `${formatUsdc(policy.maxSpendPerTaskUsdc)} USDC`,
    };
  }

  const currentDailySpend = getDailySpend(agentId);
  if (addUsdc(currentDailySpend, amountUsdc) > policy.maxSpendPerDayUsdc) {
    return {
      allowed: false,
      requiresApproval: false,
      reason:
        `Daily limit exceeded. Current: $${formatUsdc(currentDailySpend)}, ` +
        `requested: $${formatUsdc(amountUsdc)}, limit: $` +
        `${formatUsdc(policy.maxSpendPerDayUsdc)}`,
    };
  }

  if (amountUsdc >= policy.approvalThresholdUsdc) {
    return {
      allowed: true,
      requiresApproval: true,
      reason:
        `Amount $${formatUsdc(amountUsdc)} meets or exceeds approval threshold of $` +
        `${formatUsdc(policy.approvalThresholdUsdc)}. Human approval required.`,
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    reason:
      `Policy "${policy.policyId}" approved $${formatUsdc(amountUsdc)} USDC ` +
      `for agent "${agentId}" in district "${districtId}"`,
  };
}

export function recordSettlement(agentId: string, amountUsdc: UsdcAmount): void {
  recordDailySpend(agentId, amountUsdc);
}

export const DEFAULT_DEV_POLICY: WalletGuardPolicy = {
  policyId: "dev-default",
  agentId: "*",
  maxSpendPerTaskUsdc: parseUsdc("0.10"),
  maxSpendPerDayUsdc: parseUsdc("1.00"),
  approvalThresholdUsdc: parseUsdc("0.05"),
  allowedDistricts: ["*"],
  blockedDistricts: ["dark-alley"],
  dryRun: true,
  notes: "Default development policy — dry-run only. No real funds move.",
};

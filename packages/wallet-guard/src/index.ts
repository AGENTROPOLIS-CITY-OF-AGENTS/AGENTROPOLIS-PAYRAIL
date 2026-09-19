// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — wallet-guard
// Policy engine that enforces spend limits and guardrails.
//
// "No agent gets raw wallet power."
//
// This module NEVER handles private keys, seed phrases, or signing keys.
// It evaluates policy rules and returns a decision — settlement happens
// elsewhere (x402-adapter, Phase 2).
//
// Money is compared in integer minor units (6-decimal ERC-20 USDC) whenever
// the policy provides minor-unit limits, avoiding floating-point drift.
// ---------------------------------------------------------------------------

import type { PaymentRequest, UsdcAmount } from "@agentropolis/payrail-core";
import { legacyUsdcToMinorUnits } from "@agentropolis/payrail-core";

// ---------------------------------------------------------------------------
// Policy types
// ---------------------------------------------------------------------------

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
  /**
   * Optional integer minor-unit limits (6-decimal ERC-20 USDC). When present,
   * limit checks use integer arithmetic instead of float comparison.
   */
  maxSpendPerTaskMinorUnits?: bigint;
  maxSpendPerDayMinorUnits?: bigint;
  approvalThresholdMinorUnits?: bigint;
}

export type GuardDecision =
  | { allowed: true; requiresApproval: false; status: "SIMULATED"; reason: string }
  | { allowed: true; requiresApproval: false; status: "PENDING"; reason: string }
  | { allowed: true; requiresApproval: true; status: "PENDING"; reason: string }
  | { allowed: false; requiresApproval: false; status: "BLOCKED"; reason: string };

// ---------------------------------------------------------------------------
// Daily spend tracking (in-memory — replace with persistent store in Phase 1)
// ---------------------------------------------------------------------------

/** TODO: Phase 1 — replace with persistent daily spend tracker (DB/Redis) */
const dailySpendTracker = new Map<string, { total: UsdcAmount; date: string }>();

console.warn(
  "[wallet-guard] WARNING: Using in-memory daily spend tracker. " +
    "Limits reset on restart — replace with persistent storage in Phase 1 before production use.",
);

function getDailySpend(agentId: string): UsdcAmount {
  const today = new Date().toISOString().slice(0, 10);
  const entry = dailySpendTracker.get(agentId);
  if (!entry || entry.date !== today) return 0;
  return entry.total;
}

function recordDailySpend(agentId: string, amount: UsdcAmount): void {
  const today = new Date().toISOString().slice(0, 10);
  const existing = dailySpendTracker.get(agentId);
  if (!existing || existing.date !== today) {
    dailySpendTracker.set(agentId, { total: amount, date: today });
  } else {
    dailySpendTracker.set(agentId, { total: existing.total + amount, date: today });
  }
}

// ---------------------------------------------------------------------------
// Core guard evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a payment request against a wallet guard policy.
 * Returns a GuardDecision — never performs actual settlement.
 *
 * TODO: Phase 1 — load policy from a policy store, not passed directly
 */
export function evaluatePolicy(
  request: PaymentRequest,
  policy: WalletGuardPolicy,
): GuardDecision {
  const { amountUsdc, districtId, agentId } = request;

  // Dry-run: always allowed, no funds move
  if (policy.dryRun) {
    return {
      allowed: true,
      requiresApproval: false,
      status: "SIMULATED",
      reason: `[DRY-RUN] Policy evaluated. No funds moved. Amount: $${amountUsdc} USDC`,
    };
  }

  // Blocked district check
  if (policy.blockedDistricts.includes(districtId)) {
    return {
      allowed: false,
      requiresApproval: false,
      status: "BLOCKED",
      reason: `District "${districtId}" is blocked by policy "${policy.policyId}"`,
    };
  }

  // Allowed district check (if not wildcard)
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

  // Per-task limit (integer minor units when provided, else float)
  if (policy.maxSpendPerTaskMinorUnits !== undefined) {
    const amountMinor = legacyUsdcToMinorUnits(amountUsdc);
    if (amountMinor > policy.maxSpendPerTaskMinorUnits) {
      return {
        allowed: false,
        requiresApproval: false,
        status: "BLOCKED",
        reason: `Amount $${amountUsdc} exceeds per-task limit of $${policy.maxSpendPerTaskUsdc} USDC`,
      };
    }
  } else if (amountUsdc > policy.maxSpendPerTaskUsdc) {
    return {
      allowed: false,
      requiresApproval: false,
      status: "BLOCKED",
      reason: `Amount $${amountUsdc} exceeds per-task limit of $${policy.maxSpendPerTaskUsdc} USDC`,
    };
  }

  // Daily limit (integer minor units when provided, else float)
  const currentDailySpend = getDailySpend(agentId);
  if (policy.maxSpendPerDayMinorUnits !== undefined) {
    const amountMinor = legacyUsdcToMinorUnits(amountUsdc);
    const currentMinor = legacyUsdcToMinorUnits(currentDailySpend);
    if (currentMinor + amountMinor > policy.maxSpendPerDayMinorUnits) {
      return {
        allowed: false,
        requiresApproval: false,
        status: "BLOCKED",
        reason: `Daily limit exceeded. Current: $${currentDailySpend}, requested: $${amountUsdc}, limit: $${policy.maxSpendPerDayUsdc}`,
      };
    }
  } else if (currentDailySpend + amountUsdc > policy.maxSpendPerDayUsdc) {
    return {
      allowed: false,
      requiresApproval: false,
      status: "BLOCKED",
      reason: `Daily limit exceeded. Current: $${currentDailySpend}, requested: $${amountUsdc}, limit: $${policy.maxSpendPerDayUsdc}`,
    };
  }

  // Approval threshold (integer minor units when provided, else float)
  if (policy.approvalThresholdMinorUnits !== undefined) {
    const amountMinor = legacyUsdcToMinorUnits(amountUsdc);
    if (amountMinor >= policy.approvalThresholdMinorUnits) {
      return {
        allowed: true,
        requiresApproval: true,
        status: "PENDING",
        reason: `Amount $${amountUsdc} meets or exceeds approval threshold of $${policy.approvalThresholdUsdc}. Human approval required.`,
      };
    }
  } else if (amountUsdc >= policy.approvalThresholdUsdc) {
    return {
      allowed: true,
      requiresApproval: true,
      status: "PENDING",
      reason: `Amount $${amountUsdc} meets or exceeds approval threshold of $${policy.approvalThresholdUsdc}. Human approval required.`,
    };
  }

  // All checks passed
  return {
    allowed: true,
    requiresApproval: false,
    status: "PENDING",
    reason: `Policy "${policy.policyId}" approved $${amountUsdc} USDC for agent "${agentId}" in district "${districtId}"`,
  };
}

/**
 * Record that a payment was settled (updates daily spend tracker).
 * Call this AFTER successful settlement confirmation.
 *
 * TODO: Phase 1 — persist to DB/Redis instead of in-memory map
 */
export function recordSettlement(agentId: string, amountUsdc: UsdcAmount): void {
  recordDailySpend(agentId, amountUsdc);
}

// ---------------------------------------------------------------------------
// Default development policy (dry-run, very conservative)
// ---------------------------------------------------------------------------

export const DEFAULT_DEV_POLICY: WalletGuardPolicy = {
  policyId: "dev-default",
  agentId: "*",
  maxSpendPerTaskUsdc: 0.1,
  maxSpendPerDayUsdc: 1.0,
  approvalThresholdUsdc: 0.05,
  allowedDistricts: ["*"],
  blockedDistricts: ["dark-alley"],
  dryRun: true,
  notes: "Default development policy — dry-run only. No real funds move.",
};

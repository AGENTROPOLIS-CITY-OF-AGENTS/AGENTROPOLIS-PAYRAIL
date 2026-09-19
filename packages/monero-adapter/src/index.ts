// AGENTROPOLIS-PAYRAIL — Monero/XMR adapter
// Dry-run reference implementation only. No wallet RPC, signing, custody,
// private keys, seed phrases, spend keys, or production configuration.
//
// Result shapes use the canonical SettlementOutcome vocabulary
// (SIMULATED / BLOCKED / FAILED). A SIMULATED result never carries a txId.

import type { SettlementOutcome } from "@agentropolis/payrail-core";
import { blockedOutcome, failedOutcome, simulatedOutcome } from "@agentropolis/payrail-core";

export type PrivacyDecision = "approved" | "denied" | "approval-required";

export interface MoneroSettlementRequest {
  intentId: string;
  mandateId: string;
  mandateVersion: number;
  agentId: string;
  districtId: string;
  destination: string;
  amountXmr: string;
  idempotencyKey: string;
  privacyDecision: PrivacyDecision;
  privacyPolicyId: string;
  disclosureProfile: "principal-only" | "authorized-auditor" | "regulated-disclosure";
  dryRun: true;
}

export interface MoneroSettlementResult {
  outcome: SettlementOutcome;
  txId: null;
  simulatedOnly: true;
  message: string;
  evidence: {
    intentId: string;
    mandateId: string;
    mandateVersion: number;
    privacyPolicyId: string;
    disclosureProfile: MoneroSettlementRequest["disclosureProfile"];
    idempotencyKey: string;
  };
}

const SECRET_FIELD_PATTERN = /(seed|mnemonic|private.?key|spend.?key|wallet.?password|rpc.?password)/i;

function rejectSecretMaterial(value: unknown, path = "request"): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_FIELD_PATTERN.test(key)) {
      throw new Error(`Secret material is forbidden in the public Monero adapter contract: ${path}.${key}`);
    }
    rejectSecretMaterial(child, `${path}.${key}`);
  }
}

function validateAmount(amountXmr: string): void {
  if (!/^[0-9]+(\.[0-9]{1,12})?$/.test(amountXmr) || Number(amountXmr) <= 0) {
    throw new Error("amountXmr must be a positive decimal string with at most 12 decimal places");
  }
}

export async function simulateMoneroSettlement(
  request: MoneroSettlementRequest
): Promise<MoneroSettlementResult> {
  rejectSecretMaterial(request);
  validateAmount(request.amountXmr);

  if (request.dryRun !== true) {
    throw new Error("Public Monero adapter is dry-run only");
  }

  const evidence = {
    intentId: request.intentId,
    mandateId: request.mandateId,
    mandateVersion: request.mandateVersion,
    privacyPolicyId: request.privacyPolicyId,
    disclosureProfile: request.disclosureProfile,
    idempotencyKey: request.idempotencyKey,
  };

  if (request.privacyDecision === "denied") {
    return {
      outcome: blockedOutcome(
        "Hush54 privacy policy denied XMR settlement.",
        "privacy-policy-denied",
      ),
      txId: null,
      simulatedOnly: true,
      message: "Hush54 privacy policy denied XMR settlement.",
      evidence,
    };
  }

  if (request.privacyDecision === "approval-required") {
    return {
      outcome: failedOutcome(
        "Explicit approval is required before XMR settlement may proceed.",
        "approval-required",
      ),
      txId: null,
      simulatedOnly: true,
      message: "Explicit approval is required before XMR settlement may proceed.",
      evidence,
    };
  }

  return {
    outcome: simulatedOutcome(
      `[SIMULATED] ${request.amountXmr} XMR settlement authorized by Hush54 policy. No funds moved.`,
      `sim-${request.idempotencyKey}`,
    ),
    txId: null,
    simulatedOnly: true,
    message: `[SIMULATED] ${request.amountXmr} XMR settlement authorized by Hush54 policy. No funds moved.`,
    evidence,
  };
}

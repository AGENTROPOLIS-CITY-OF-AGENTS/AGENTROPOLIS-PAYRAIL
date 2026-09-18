// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — adapter-conformance
//
// Conformance checks for chain adapters selected by the Genesis Spawn Chain
// Oracle. This module does not perform settlement or launch tokens.
// ---------------------------------------------------------------------------

export type AdapterKind = "settlement" | "token-launch" | "nft-issuance";
export type AdapterMaturity =
  | "candidate"
  | "planned"
  | "testnet"
  | "testnet-in-pr"
  | "dry-run"
  | "production"
  | "blocked";

export interface AdapterAuthorityContract {
  requiresGenesisSpawnApproval: boolean;
  requiresAegisApproval: boolean;
  requiresExecutionEnvelope: boolean;
  requiresLaunchEscrow: boolean;
  agentRawKeyAccess: false;
  selfAuthorize: false;
}

export interface AdapterSafetyContract {
  dryRunDefault: boolean;
  externalSignerRequired: boolean;
  replayProtectionRequired: boolean;
  idempotencyRequired: boolean;
  receiptRequired: boolean;
  finalityVerificationRequired: boolean;
  spendCeilingRequired: boolean;
  canonicalAssetIdentityRequired: boolean;
  continuityMigrationSupported: boolean;
}

export interface AdapterManifest {
  adapterId: string;
  chainId: string;
  displayName: string;
  family: "evm" | "xrpl" | "svm" | "move" | "other";
  kinds: AdapterKind[];
  maturity: AdapterMaturity;
  sourceRefs: string[];
  authority: AdapterAuthorityContract;
  safety: AdapterSafetyContract;
  notes?: string[];
}

export interface ConformanceFinding {
  code: string;
  severity: "blocker" | "warning";
  message: string;
}

export interface ConformanceResult {
  adapterId: string;
  conformantForProduction: boolean;
  findings: ConformanceFinding[];
}

export function evaluateAdapterConformance(
  manifest: AdapterManifest,
): ConformanceResult {
  const findings: ConformanceFinding[] = [];

  if (!manifest.sourceRefs.length) {
    findings.push({
      code: "SOURCE_REQUIRED",
      severity: "blocker",
      message: "Adapter must cite implementation/evidence sources.",
    });
  }

  const authority = manifest.authority;
  if (!authority.requiresGenesisSpawnApproval) {
    findings.push({
      code: "GENESIS_APPROVAL_REQUIRED",
      severity: "blocker",
      message: "Token/economic launch paths must remain gated by Genesis Spawn.",
    });
  }
  if (!authority.requiresAegisApproval) {
    findings.push({
      code: "AEGIS_APPROVAL_REQUIRED",
      severity: "blocker",
      message: "Adapter cannot bypass AEGIS policy/risk review.",
    });
  }
  if (!authority.requiresExecutionEnvelope) {
    findings.push({
      code: "EXECUTION_ENVELOPE_REQUIRED",
      severity: "blocker",
      message: "Execution must be bound to an Execution Envelope.",
    });
  }
  if (!authority.requiresLaunchEscrow) {
    findings.push({
      code: "LAUNCH_ESCROW_REQUIRED",
      severity: "blocker",
      message: "Capital movement for launches must remain Launch Escrow-bound.",
    });
  }

  const safety = manifest.safety;
  const requiredSafety: Array<[keyof AdapterSafetyContract, string]> = [
    ["externalSignerRequired", "External signing boundary is required."],
    ["replayProtectionRequired", "Replay protection is required."],
    ["idempotencyRequired", "Idempotency protection is required."],
    ["receiptRequired", "Every consequential action requires a receipt."],
    ["finalityVerificationRequired", "Finality verification is required."],
    ["spendCeilingRequired", "Spend ceilings are required."],
    ["canonicalAssetIdentityRequired", "Canonical asset identity is required."],
    ["continuityMigrationSupported", "Continuity/migration support is required."],
  ];

  for (const [key, message] of requiredSafety) {
    if (!safety[key]) {
      findings.push({
        code: `SAFETY_${String(key).toUpperCase()}`,
        severity: "blocker",
        message,
      });
    }
  }

  if (manifest.maturity === "production" && safety.dryRunDefault) {
    findings.push({
      code: "PRODUCTION_DRY_RUN_DEFAULT",
      severity: "warning",
      message:
        "Production adapter is still dry-run by default; operator activation must be explicit.",
    });
  }

  if (manifest.maturity !== "production") {
    findings.push({
      code: "NOT_PRODUCTION",
      severity: "blocker",
      message: `Adapter maturity is ${manifest.maturity}; production execution is not authorized.`,
    });
  }

  return {
    adapterId: manifest.adapterId,
    conformantForProduction: findings.every((f) => f.severity !== "blocker"),
    findings,
  };
}

export const REFERENCE_ADAPTERS: AdapterManifest[] = [
  {
    adapterId: "arc-payrail",
    chainId: "arc",
    displayName: "Arc PAYRAIL Settlement Adapter",
    family: "evm",
    kinds: ["settlement"],
    maturity: "testnet-in-pr",
    sourceRefs: [
      "https://github.com/AGENTROPOLIS-CITY-OF-AGENTS/AGENTROPOLIS-PAYRAIL/pull/10",
    ],
    authority: {
      requiresGenesisSpawnApproval: true,
      requiresAegisApproval: true,
      requiresExecutionEnvelope: true,
      requiresLaunchEscrow: true,
      agentRawKeyAccess: false,
      selfAuthorize: false,
    },
    safety: {
      dryRunDefault: true,
      externalSignerRequired: true,
      replayProtectionRequired: true,
      idempotencyRequired: true,
      receiptRequired: true,
      finalityVerificationRequired: true,
      spendCeilingRequired: true,
      canonicalAssetIdentityRequired: true,
      continuityMigrationSupported: true,
    },
    notes: [
      "Existing Arc adapter work remains additive and guarded.",
      "Mainnet live execution remains blocked until outstanding gates are implemented.",
    ],
  },
  {
    adapterId: "base-x402-payrail",
    chainId: "base",
    displayName: "Base x402 PAYRAIL Adapter",
    family: "evm",
    kinds: ["settlement"],
    maturity: "dry-run",
    sourceRefs: [
      "https://github.com/AGENTROPOLIS-CITY-OF-AGENTS/AGENTROPOLIS-PAYRAIL",
    ],
    authority: {
      requiresGenesisSpawnApproval: true,
      requiresAegisApproval: true,
      requiresExecutionEnvelope: true,
      requiresLaunchEscrow: true,
      agentRawKeyAccess: false,
      selfAuthorize: false,
    },
    safety: {
      dryRunDefault: true,
      externalSignerRequired: true,
      replayProtectionRequired: true,
      idempotencyRequired: true,
      receiptRequired: true,
      finalityVerificationRequired: true,
      spendCeilingRequired: true,
      canonicalAssetIdentityRequired: true,
      continuityMigrationSupported: true,
    },
    notes: ["Current x402 package remains simulation/dry-run oriented."],
  },
  {
    adapterId: "robinhood-bags-launch",
    chainId: "robinhood-chain",
    displayName: "Robinhood Chain / Bags Launch Adapter",
    family: "evm",
    kinds: ["token-launch"],
    maturity: "candidate",
    sourceRefs: [
      "https://docs.robinhood.com/chain/",
      "https://bags.fm/",
    ],
    authority: {
      requiresGenesisSpawnApproval: true,
      requiresAegisApproval: true,
      requiresExecutionEnvelope: true,
      requiresLaunchEscrow: true,
      agentRawKeyAccess: false,
      selfAuthorize: false,
    },
    safety: {
      dryRunDefault: true,
      externalSignerRequired: true,
      replayProtectionRequired: true,
      idempotencyRequired: true,
      receiptRequired: true,
      finalityVerificationRequired: true,
      spendCeilingRequired: true,
      canonicalAssetIdentityRequired: true,
      continuityMigrationSupported: true,
    },
    notes: [
      "Bags is a replaceable execution adapter, never Genesis Spawn authority.",
      "Live integration and current contract/API verification still required.",
    ],
  },
  {
    adapterId: "xrpl-payrail",
    chainId: "xrpl",
    displayName: "XRPL PAYRAIL Adapter",
    family: "xrpl",
    kinds: ["settlement", "token-launch"],
    maturity: "planned",
    sourceRefs: [
      "https://xrpl.org/docs/agents/agentic-transactions",
      "https://xrpl.org/docs/agents/agentic-payments-x402",
    ],
    authority: {
      requiresGenesisSpawnApproval: true,
      requiresAegisApproval: true,
      requiresExecutionEnvelope: true,
      requiresLaunchEscrow: true,
      agentRawKeyAccess: false,
      selfAuthorize: false,
    },
    safety: {
      dryRunDefault: true,
      externalSignerRequired: true,
      replayProtectionRequired: true,
      idempotencyRequired: true,
      receiptRequired: true,
      finalityVerificationRequired: true,
      spendCeilingRequired: true,
      canonicalAssetIdentityRequired: true,
      continuityMigrationSupported: true,
    },
    notes: [
      "XRPL is already an explicit PAYRAIL candidate lane; adapter implementation remains future work.",
    ],
  },
];

export function evaluateReferenceAdapters(): ConformanceResult[] {
  return REFERENCE_ADAPTERS.map(evaluateAdapterConformance);
}

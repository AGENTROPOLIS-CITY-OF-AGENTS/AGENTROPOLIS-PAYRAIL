// AGENTROPOLIS-PAYRAIL — pricing-rules
// Integer-only USDC pricing. No floating-point money.

import type {
  DistrictId,
  UsdcMinorUnitString,
} from "@agentropolis/payrail-core";
import {
  usdcMinorUnitBigInt,
  usdcMinorUnitString,
} from "@agentropolis/payrail-core";

export interface PricingRule {
  ruleId: string;
  districtId: DistrictId | "*";
  taskType: string;
  basePriceMinorUnits: UsdcMinorUnitString;
  description: string;
  /** Integer basis points. 10_000 = 1.0x. */
  multiplierBps: number;
  notes?: string;
  active: boolean;
}

const BASE_RULES: PricingRule[] = [
  {
    ruleId: "downtown-osint-lookup",
    districtId: "downtown" as DistrictId,
    taskType: "osint-lookup",
    basePriceMinorUnits: usdcMinorUnitString("5000"),
    description: "Standard OSINT data lookup in downtown district",
    multiplierBps: 10_000,
    active: true,
  },
  {
    ruleId: "harbor-whale-alert",
    districtId: "harbor" as DistrictId,
    taskType: "whale-alert",
    basePriceMinorUnits: usdcMinorUnitString("10000"),
    description: "Wallet activity monitoring and threshold alert in harbor district",
    multiplierBps: 10_000,
    active: true,
  },
  {
    ruleId: "tech-row-npc-prompt",
    districtId: "tech-row" as DistrictId,
    taskType: "npc-prompt",
    basePriceMinorUnits: usdcMinorUnitString("20000"),
    description: "NPC task execution via prompt in tech-row district",
    multiplierBps: 10_000,
    active: true,
  },
  {
    ruleId: "terra54-property-check",
    districtId: "terra54" as DistrictId,
    taskType: "property-lookup",
    basePriceMinorUnits: usdcMinorUnitString("15000"),
    description: "Property data lookup in Terra54 district",
    multiplierBps: 12_000,
    notes: "20% premium for Terra54 district data access",
    active: true,
  },
  {
    ruleId: "archives-data-retrieval",
    districtId: "archives" as DistrictId,
    taskType: "data-retrieval",
    basePriceMinorUnits: usdcMinorUnitString("3000"),
    description: "Historical data retrieval from the Archives district",
    multiplierBps: 8_000,
    notes: "20% discount — archives are open access by default",
    active: true,
  },
];

export function lookupPrice(
  districtId: DistrictId,
  taskType: string,
): { rule: PricingRule; effectivePriceMinorUnits: UsdcMinorUnitString } | undefined {
  const active = BASE_RULES.filter((r) => r.active);
  const exact = active.find(
    (r) => r.districtId === districtId && r.taskType === taskType,
  );
  const wildcard = active.find(
    (r) => r.districtId === "*" && r.taskType === taskType,
  );
  const rule = exact ?? wildcard;
  if (!rule) return undefined;

  if (!Number.isInteger(rule.multiplierBps) || rule.multiplierBps < 0) {
    throw new Error("Pricing multiplierBps must be a non-negative integer");
  }

  const base = usdcMinorUnitBigInt(rule.basePriceMinorUnits);
  const numerator = base * BigInt(rule.multiplierBps);
  if (numerator % 10_000n !== 0n) {
    throw new Error(
      "Pricing rule produces sub-minor-unit precision and cannot settle exactly",
    );
  }

  return {
    rule,
    effectivePriceMinorUnits: usdcMinorUnitString(numerator / 10_000n),
  };
}

export function listRules(): PricingRule[] {
  return BASE_RULES.filter((r) => r.active);
}

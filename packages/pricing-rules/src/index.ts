// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — pricing-rules
// Exact-money district pricing rules.
// ---------------------------------------------------------------------------

import {
  multiplyUsdcByBps,
  parseUsdc,
  type DistrictId,
  type UsdcAmount,
} from "@agentropolis/payrail-core";

export interface PricingRule {
  ruleId: string;
  districtId: DistrictId | "*";
  taskType: string;
  basePriceUsdc: UsdcAmount;
  description: string;
  multiplierBps: number;
  notes?: string;
  active: boolean;
}

const BASE_RULES: PricingRule[] = [
  {
    ruleId: "downtown-osint-lookup",
    districtId: "downtown" as DistrictId,
    taskType: "osint-lookup",
    basePriceUsdc: parseUsdc("0.005"),
    description: "Standard OSINT data lookup in downtown district",
    multiplierBps: 10_000,
    active: true,
  },
  {
    ruleId: "harbor-whale-alert",
    districtId: "harbor" as DistrictId,
    taskType: "whale-alert",
    basePriceUsdc: parseUsdc("0.01"),
    description: "Wallet activity monitoring and threshold alert in harbor district",
    multiplierBps: 10_000,
    active: true,
  },
  {
    ruleId: "tech-row-npc-prompt",
    districtId: "tech-row" as DistrictId,
    taskType: "npc-prompt",
    basePriceUsdc: parseUsdc("0.02"),
    description: "NPC task execution via prompt in tech-row district",
    multiplierBps: 10_000,
    active: true,
  },
  {
    ruleId: "terra54-property-check",
    districtId: "terra54" as DistrictId,
    taskType: "property-lookup",
    basePriceUsdc: parseUsdc("0.015"),
    description: "Property data lookup in Terra54 district",
    multiplierBps: 12_000,
    notes: "20% premium for Terra54 district data access",
    active: true,
  },
  {
    ruleId: "archives-data-retrieval",
    districtId: "archives" as DistrictId,
    taskType: "data-retrieval",
    basePriceUsdc: parseUsdc("0.003"),
    description: "Historical data retrieval from the Archives district",
    multiplierBps: 8_000,
    notes: "20% discount — archives are open access by default",
    active: true,
  },
];

export function lookupPrice(
  districtId: DistrictId,
  taskType: string,
): { rule: PricingRule; effectivePriceUsdc: UsdcAmount } | undefined {
  const active = BASE_RULES.filter((rule) => rule.active);
  const exact = active.find(
    (rule) => rule.districtId === districtId && rule.taskType === taskType,
  );
  const wildcard = active.find(
    (rule) => rule.districtId === "*" && rule.taskType === taskType,
  );

  const rule = exact ?? wildcard;
  if (!rule) return undefined;

  return {
    rule,
    effectivePriceUsdc: multiplyUsdcByBps(rule.basePriceUsdc, rule.multiplierBps),
  };
}

export function listRules(): PricingRule[] {
  return BASE_RULES.filter((rule) => rule.active);
}

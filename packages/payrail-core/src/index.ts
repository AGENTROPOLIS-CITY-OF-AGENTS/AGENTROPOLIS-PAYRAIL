// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — payrail-core
// Shared types, exact-money utilities, and chain constants.
// ---------------------------------------------------------------------------

export const PAYRAIL_VERSION = "0.3.0";

export type AgentId = string & { readonly __brand: "AgentId" };
export type DistrictId = string & { readonly __brand: "DistrictId" };
export type TaskId = string & { readonly __brand: "TaskId" };
export type ReceiptId = string & { readonly __brand: "ReceiptId" };
export type PolicyId = string & { readonly __brand: "PolicyId" };

/**
 * Canonical PAYRAIL USDC accounting precision.
 *
 * PAYRAIL stores USDC accounting values in the token's canonical 6-decimal
 * minor units. Arc's native gas currency reports 18 decimals at the EVM rail
 * boundary; that is a rail-native representation, not PAYRAIL's accounting
 * scale. Conversion must therefore be explicit and exact at the adapter edge.
 *
 * Arc reference:
 * https://github.com/circlefin/arc-node/blob/main/BREAKING_CHANGES.md
 */
export const USDC_MINOR_UNIT_DECIMALS = 6 as const;

export type UsdcMinorAmount = bigint & {
  readonly __brand: "UsdcMinorAmount";
};

/** Backward-compatible name; now exact integer minor units, never a float. */
export type UsdcAmount = UsdcMinorAmount;

export const ZERO_USDC = 0n as UsdcMinorAmount;

export function parseUsdc(input: string): UsdcMinorAmount {
  if (typeof input !== "string" || input.length === 0) {
    throw new Error("USDC amount must be a non-empty decimal string");
  }
  if (/[eE]/.test(input)) {
    throw new Error("Scientific notation is not allowed for USDC amounts");
  }
  if (!/^(0|[1-9]\d*)(?:\.(\d+))?$/.test(input)) {
    throw new Error("USDC amount must be a non-negative base-10 decimal string");
  }

  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > USDC_MINOR_UNIT_DECIMALS) {
    throw new Error(
      `USDC amount exceeds ${USDC_MINOR_UNIT_DECIMALS} decimal places`,
    );
  }

  const padded = fraction.padEnd(USDC_MINOR_UNIT_DECIMALS, "0");
  return BigInt(`${whole}${padded}`) as UsdcMinorAmount;
}

export function formatUsdc(amount: UsdcMinorAmount): string {
  if (amount < 0n) throw new Error("Negative USDC amounts are not supported");

  const scale = 10n ** BigInt(USDC_MINOR_UNIT_DECIMALS);
  const whole = amount / scale;
  const remainder = amount % scale;
  if (remainder === 0n) return whole.toString();

  const fraction = remainder
    .toString()
    .padStart(USDC_MINOR_UNIT_DECIMALS, "0")
    .replace(/0+$/, "");

  return `${whole}.${fraction}`;
}

export function addUsdc(
  left: UsdcMinorAmount,
  right: UsdcMinorAmount,
): UsdcMinorAmount {
  return (left + right) as UsdcMinorAmount;
}

export function multiplyUsdcByBps(
  amount: UsdcMinorAmount,
  basisPoints: number,
): UsdcMinorAmount {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new Error("basisPoints must be a non-negative integer");
  }
  return ((amount * BigInt(basisPoints)) / 10_000n) as UsdcMinorAmount;
}

/**
 * Convert PAYRAIL's canonical 6-decimal USDC accounting units into a rail's
 * native integer scale. Upscaling is exact. Downscaling is rejected unless
 * exact so value is never rounded silently.
 */
export function scaleUsdcToDecimals(
  amount: UsdcMinorAmount,
  targetDecimals: number,
): bigint {
  if (!Number.isInteger(targetDecimals) || targetDecimals < 0) {
    throw new Error("targetDecimals must be a non-negative integer");
  }

  const delta = targetDecimals - USDC_MINOR_UNIT_DECIMALS;
  if (delta === 0) return amount;
  if (delta > 0) return amount * 10n ** BigInt(delta);

  const divisor = 10n ** BigInt(-delta);
  if (amount % divisor !== 0n) {
    throw new Error("USDC amount cannot be downscaled without precision loss");
  }
  return amount / divisor;
}

// ---------------------------------------------------------------------------
// Chain-agnostic EVM settlement architecture
// ---------------------------------------------------------------------------

export type EvmAddress = `0x${string}`;
export type NativeGasToken = "ETH" | "USDC";

export type WalletRole =
  | "human-owner"
  | "treasury"
  | "agent"
  | "revenue"
  | "burner-discovery";

export interface EvmChainConfig {
  chainId: number;
  name: string;
  slug: string;
  nativeCurrency: NativeGasToken;
  nativeCurrencyDecimals?: number;
  settlementConfirmations?: number;
  rpcEnvVar?: string;
  explorerUrl?: string;
  dryRunByDefault: boolean;
  enabled: boolean;
}

/**
 * Known EVM-compatible rails.
 *
 * Metadata presence never enables live settlement.
 */
export const EVM_CHAINS = {
  BASE: {
    chainId: 8453,
    name: "Base",
    slug: "base",
    nativeCurrency: "ETH",
    nativeCurrencyDecimals: 18,
    rpcEnvVar: "BASE_MAINNET_RPC_URL",
    dryRunByDefault: true,
    enabled: true,
  },
  BASE_SEPOLIA: {
    chainId: 84532,
    name: "Base Sepolia",
    slug: "base-sepolia",
    nativeCurrency: "ETH",
    nativeCurrencyDecimals: 18,
    rpcEnvVar: "BASE_SEPOLIA_RPC_URL",
    dryRunByDefault: true,
    enabled: true,
  },
  ARC_MAINNET: {
    chainId: 5042,
    name: "Arc",
    slug: "arc-mainnet",
    nativeCurrency: "USDC",
    nativeCurrencyDecimals: 18,
    settlementConfirmations: 1,
    rpcEnvVar: "ARC_MAINNET_RPC_URL",
    explorerUrl: "https://explorer.arc.io",
    dryRunByDefault: true,
    enabled: false,
  },
  ARC_TESTNET: {
    chainId: 5042002,
    name: "Arc Testnet",
    slug: "arc-testnet",
    nativeCurrency: "USDC",
    nativeCurrencyDecimals: 18,
    settlementConfirmations: 1,
    rpcEnvVar: "ARC_TESTNET_RPC_URL",
    explorerUrl: "https://explorer.testnet.arc.io",
    dryRunByDefault: true,
    enabled: true,
  },
  ETHEREUM: {
    chainId: 1,
    name: "Ethereum",
    slug: "ethereum",
    nativeCurrency: "ETH",
    nativeCurrencyDecimals: 18,
    rpcEnvVar: "ETHEREUM_RPC_URL",
    dryRunByDefault: true,
    enabled: false,
  },
  ROBINHOOD_CHAIN: {
    chainId: 4663,
    name: "Robinhood Chain",
    slug: "robinhood-chain",
    nativeCurrency: "ETH",
    nativeCurrencyDecimals: 18,
    rpcEnvVar: "ROBINHOOD_CHAIN_RPC_URL",
    dryRunByDefault: true,
    enabled: false,
  },
} as const satisfies Record<string, EvmChainConfig>;

export type EvmChain = (typeof EVM_CHAINS)[keyof typeof EVM_CHAINS];
export type SettlementRailSlug = EvmChain["slug"];

export const DEFAULT_EVM_CHAIN = EVM_CHAINS.BASE;

export function getEvmChainById(chainId: number): EvmChain | undefined {
  return Object.values(EVM_CHAINS).find((chain) => chain.chainId === chainId);
}

export function getEvmChainBySlug(slug: string): EvmChain | undefined {
  return Object.values(EVM_CHAINS).find((chain) => chain.slug === slug);
}

export interface ExternalEvmRailConfig extends EvmChainConfig {
  source: "operator-config";
}

export interface WalletExecutionContext {
  chainId: number;
  settlementRail?: SettlementRailSlug;
  walletRole: WalletRole;
  walletAddress?: EvmAddress;
  targetAddress?: EvmAddress;
  functionSelector?: `0x${string}`;
  tokenAddress?: EvmAddress;
  tokenSymbol?: string;
  approvalAmountUsdc?: UsdcAmount;
  sessionKeyId?: string;
  sessionExpiresAt?: string;
}

// ---------------------------------------------------------------------------
// Executed-settlement type barrier
// ---------------------------------------------------------------------------

declare const executedSettlementBrand: unique symbol;

export type ExecutedSettlement = {
  kind: "executed";
  txHash: `0x${string}`;
  receiptId: string;
  rail: SettlementRailSlug;
  chainId: number;
  confirmations: number;
  executionMode: "live";
  [executedSettlementBrand]: true;
};

// ---------------------------------------------------------------------------
// Payment request
// ---------------------------------------------------------------------------

export interface PaymentRequest {
  agentId: AgentId;
  districtId: DistrictId;
  taskId: TaskId;
  taskType: string;
  amountUsdc: UsdcAmount;
  description: string;
  dryRun: boolean;
  requestedAt: string;
  execution?: WalletExecutionContext;
  metadata?: Record<string, unknown>;
}

export type PaymentStatus =
  | "dry-run-accepted"
  | "policy-blocked"
  | "pending-approval"
  | "settled"
  | "failed";

export interface PaymentResult {
  status: PaymentStatus;
  taskId: TaskId;
  receiptId: ReceiptId | null;
  amountUsdc: UsdcAmount;
  message: string;
  timestamp: string;
}

export const DISTRICTS = {
  DOWNTOWN: "downtown" as DistrictId,
  HARBOR: "harbor" as DistrictId,
  TECH_ROW: "tech-row" as DistrictId,
  TERRA54: "terra54" as DistrictId,
  DARK_ALLEY: "dark-alley" as DistrictId,
  ARCHIVES: "archives" as DistrictId,
} as const;

export type KnownDistrict = (typeof DISTRICTS)[keyof typeof DISTRICTS];

export function formatTimestamp(date: Date): string {
  return date.toISOString();
}

export function generateId(prefix: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${uuid}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

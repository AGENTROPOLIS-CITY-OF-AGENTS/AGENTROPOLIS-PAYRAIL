// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — payrail-core
// Shared types, utilities, and constants used across the monorepo.
// ---------------------------------------------------------------------------

export const PAYRAIL_VERSION = "0.2.0";

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

/** Unique identifier types — branded strings for type safety */
export type AgentId = string & { readonly __brand: "AgentId" };
export type DistrictId = string & { readonly __brand: "DistrictId" };
export type TaskId = string & { readonly __brand: "TaskId" };
export type ReceiptId = string & { readonly __brand: "ReceiptId" };
export type PolicyId = string & { readonly __brand: "PolicyId" };

/** USDC settlement amount represented with the token's 6-decimal interface. */
export type UsdcAmount = number;

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
  /** Native gas-unit decimals. Arc native USDC uses 18 decimals. */
  nativeCurrencyDecimals?: number;
  /** Minimum confirmations required by the PAYRAIL adapter. */
  settlementConfirmations?: number;
  /** Environment variable that supplies the RPC URL. Never commit RPC secrets. */
  rpcEnvVar?: string;
  explorerUrl?: string;
  dryRunByDefault: boolean;
  enabled: boolean;
}

/**
 * Known EVM-compatible rails.
 *
 * Arc is intentionally additive. Base remains the architectural default and
 * no chain gets authority to bypass wallet-guard, AEGIS, or execution policy.
 * Mainnet-capable rails stay dry-run by default until an operator explicitly
 * enables a signer and approval path.
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
  ARC: {
    chainId: 5042,
    name: "Arc",
    slug: "arc",
    nativeCurrency: "USDC",
    nativeCurrencyDecimals: 18,
    settlementConfirmations: 1,
    rpcEnvVar: "ARC_MAINNET_RPC_URL",
    explorerUrl: "https://explorer.arc.io",
    dryRunByDefault: true,
    enabled: true,
  },
  ARC_TESTNET: {
    chainId: 5042002,
    name: "Arc Testnet",
    slug: "arc-testnet",
    nativeCurrency: "USDC",
    nativeCurrencyDecimals: 18,
    settlementConfirmations: 1,
    rpcEnvVar: "ARC_TESTNET_RPC_URL",
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

/**
 * Base remains the architectural default. Arc is a first-class optional rail,
 * never a replacement for chain-agnostic routing.
 */
export const DEFAULT_EVM_CHAIN = EVM_CHAINS.BASE;

export function getEvmChainById(chainId: number): EvmChain | undefined {
  return Object.values(EVM_CHAINS).find((chain) => chain.chainId === chainId);
}

export function getEvmChainBySlug(slug: string): EvmChain | undefined {
  return Object.values(EVM_CHAINS).find((chain) => chain.slug === slug);
}

export interface WalletExecutionContext {
  chainId: number;
  /** Optional human-readable route request; chainId remains authoritative. */
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
  requestedAt: string; // ISO 8601
  execution?: WalletExecutionContext;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Payment result
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Districts
// ---------------------------------------------------------------------------

export const DISTRICTS = {
  DOWNTOWN: "downtown" as DistrictId,
  HARBOR: "harbor" as DistrictId,
  TECH_ROW: "tech-row" as DistrictId,
  TERRA54: "terra54" as DistrictId,
  DARK_ALLEY: "dark-alley" as DistrictId,
  ARCHIVES: "archives" as DistrictId,
} as const;

export type KnownDistrict = (typeof DISTRICTS)[keyof typeof DISTRICTS];

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Format a Date as an ISO 8601 timestamp string */
export function formatTimestamp(date: Date): string {
  return date.toISOString();
}

/** Generate a prefixed unique ID using crypto.randomUUID() (Node.js 15.6+) */
export function generateId(prefix: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${uuid}`;
}

/** Clamp a number to a min/max range */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Round settlement USDC to 6 token-interface decimals. */
export function roundUsdc(amount: UsdcAmount): UsdcAmount {
  return Math.round(amount * 1_000_000) / 1_000_000;
}

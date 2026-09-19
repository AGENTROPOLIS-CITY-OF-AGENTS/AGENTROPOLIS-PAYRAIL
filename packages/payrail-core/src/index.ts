import type { UsdcMinorUnitString } from "./money";
// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — payrail-core
// Shared types, utilities, and constants used across the monorepo.
// ---------------------------------------------------------------------------

export const PAYRAIL_VERSION = "0.2.0";

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

export type AgentId = string & { readonly __brand: "AgentId" };
export type DistrictId = string & { readonly __brand: "DistrictId" };
export type TaskId = string & { readonly __brand: "TaskId" };
export type ReceiptId = string & { readonly __brand: "ReceiptId" };
export type PolicyId = string & { readonly __brand: "PolicyId" };

// ---------------------------------------------------------------------------
// Integer-safe money + settlement status + intent binding
// ---------------------------------------------------------------------------

export * from "./money";
export * from "./status";
export * from "./signed-intent";
export * from "./replay";
export * from "./redact";
export * from "./rpc-integrity";

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
 * Known, verified EVM-compatible rails.
 *
 * Arc Mainnet metadata below is sourced from the current official Arc network
 * reference. Live execution remains disabled independently of metadata presence.
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
  approvalAmountMinorUnits?: UsdcMinorUnitString;
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
  amountMinorUnits: UsdcMinorUnitString;
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
  amountMinorUnits: UsdcMinorUnitString;
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


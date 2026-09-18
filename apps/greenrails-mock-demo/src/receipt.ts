import { MOCK_BANNER } from "./states.js";
import type { Trade } from "./engine.js";

export const MOCK_SIGNING_KEY = "mock-signing-key-not-secret";
export const SIGNATURE_LABEL = "mock signature (FNV-1a over canonical JSON; not cryptographic)";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function mockHmac(key: string, message: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const ch of `${key}|${message}|${key}`) {
    h ^= BigInt(ch.codePointAt(0) ?? 0);
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}

export interface MockReceipt {
  banner: typeof MOCK_BANNER;
  tradeId: string;
  finalState: string;
  inputRail: string;
  xentsExactOut: number;
  sellerUsdcAmount: number;
  nft: { chainId: number; contract: string; tokenId: string };
  nftTransferVerified: boolean;
  usdcPayoutVerified: boolean;
  eventIds: string[];
  signatureLabel: typeof SIGNATURE_LABEL;
  signature: string;
}

export function buildReceipt(trade: Trade): MockReceipt {
  const body = {
    banner: MOCK_BANNER,
    tradeId: trade.id,
    finalState: trade.state,
    inputRail: trade.quote.inputRail,
    xentsExactOut: trade.quote.xentsExactOut,
    sellerUsdcAmount: trade.quote.sellerUsdcAmount,
    nft: { chainId: trade.quote.nftChainId, contract: trade.quote.nftContract, tokenId: trade.quote.nftTokenId },
    nftTransferVerified: trade.nftTransferVerified,
    usdcPayoutVerified: trade.usdcPayoutVerified,
    eventIds: trade.events.map((e) => e.id),
  };
  return { ...body, signatureLabel: SIGNATURE_LABEL, signature: mockHmac(MOCK_SIGNING_KEY, canonicalJson(body)) };
}

export function verifyReceipt(receipt: MockReceipt): boolean {
  const { signature, signatureLabel: _label, ...body } = receipt;
  return mockHmac(MOCK_SIGNING_KEY, canonicalJson(body)) === signature;
}

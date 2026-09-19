import { MockSettlementEngine, type InputRail, type QuoteRequest, type Trade } from "./engine.js";

export const ROBINHOOD_CHAIN_TESTNET_ID = 46630;

export function baseQuote(inputRail: InputRail, overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  const inputAsset = inputRail === "card" ? "USD (card)" : inputRail === "usdc-base" ? "USDC (Base)" : "ETH (Base)";
  return {
    inputRail,
    inputAsset,
    inputAmount: inputRail === "supported-crypto" ? 0.0123 : 42,
    xentsExactOut: 4200,
    sellerUsdcAmount: 40,
    maxSlippageBps: 50,
    nftChainId: ROBINHOOD_CHAIN_TESTNET_ID,
    nftContract: "0xMOCKHOODTERPS000000000000000000000000000",
    nftTokenId: "1337",
    seller: "0xMOCKSELLER",
    buyer: "0xMOCKBUYER",
    quoteTtlMs: 5 * 60_000,
    ...overrides,
  };
}

export interface Scenario {
  id: string;
  label: string;
  description: string;
  run: (engine: MockSettlementEngine) => Trade;
}

function happyPath(engine: MockSettlementEngine, rail: InputRail): Trade {
  const t = engine.quote(baseQuote(rail));
  engine.reserveUsdc(t.id);
  engine.authorizeInput(t.id);
  engine.routeXents(t.id);
  engine.beginNftTransfer(t.id);
  engine.confirmNftTransfer(t.id);
  engine.releaseUsdc(t.id);
  return engine.finalizeReceipt(t.id);
}

export const SCENARIOS: Scenario[] = [
  {
    id: "card",
    label: "Card input",
    description: "Card-funded quote converted to exact-output $XENTS; seller receives USDC on Base.",
    run: (e) => happyPath(e, "card"),
  },
  {
    id: "usdc",
    label: "USDC input",
    description: "Buyer funds with USDC on Base; still routed through $XENTS for settlement.",
    run: (e) => happyPath(e, "usdc-base"),
  },
  {
    id: "crypto",
    label: "Supported-crypto input",
    description: "Supported crypto input converted to exact-output $XENTS.",
    run: (e) => happyPath(e, "supported-crypto"),
  },
  {
    id: "xents-routing",
    label: "XENTS routing view",
    description: "Stops after $XENTS routing to show consumption of the mandatory settlement asset.",
    run: (e) => {
      const t = e.quote(baseQuote("card"));
      e.reserveUsdc(t.id);
      e.authorizeInput(t.id);
      return e.routeXents(t.id);
    },
  },
  {
    id: "nft-pending",
    label: "NFT transfer pending",
    description: "Transfer submitted on Robinhood Chain testnet; awaiting confirmation threshold.",
    run: (e) => {
      const t = e.quote(baseQuote("usdc-base"));
      e.reserveUsdc(t.id);
      e.authorizeInput(t.id);
      e.routeXents(t.id);
      return e.beginNftTransfer(t.id);
    },
  },
  {
    id: "usdc-payout",
    label: "USDC payout",
    description: "NFT confirmed; reserved USDC released to seller (not yet finalized).",
    run: (e) => {
      const t = e.quote(baseQuote("card"));
      e.reserveUsdc(t.id);
      e.authorizeInput(t.id);
      e.routeXents(t.id);
      e.beginNftTransfer(t.id);
      e.confirmNftTransfer(t.id);
      return e.releaseUsdc(t.id);
    },
  },
  {
    id: "failed-refund",
    label: "Failed trade → refund",
    description: "NFT transfer reverts; reservation released and buyer input refunded.",
    run: (e) => {
      const t = e.quote(baseQuote("supported-crypto"));
      e.reserveUsdc(t.id);
      e.authorizeInput(t.id);
      e.routeXents(t.id);
      e.beginNftTransfer(t.id);
      e.confirmNftTransfer(t.id, "failed");
      return e.completeRefund(t.id);
    },
  },
  {
    id: "manual-review",
    label: "Manual review",
    description: "Chain confirmation timeout escalates to operator review; nothing auto-completes.",
    run: (e) => {
      const t = e.quote(baseQuote("card"));
      e.reserveUsdc(t.id);
      e.authorizeInput(t.id);
      e.routeXents(t.id);
      e.beginNftTransfer(t.id);
      return e.confirmNftTransfer(t.id, "timeout");
    },
  },
  {
    id: "signed-receipt",
    label: "Signed receipt",
    description: "Finalized trade with a mock signature over canonical JSON.",
    run: (e) => happyPath(e, "usdc-base"),
  },
];

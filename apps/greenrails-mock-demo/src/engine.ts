import {
  ALLOWED_TRANSITIONS,
  LIVE_FUNDS_ENABLED,
  type SettlementState,
} from "./states.js";

export type InputRail = "card" | "usdc-base" | "supported-crypto";

export interface QuoteRequest {
  inputRail: InputRail;
  inputAsset: string;
  inputAmount: number;
  xentsExactOut: number;
  sellerUsdcAmount: number;
  maxSlippageBps: number;
  nftChainId: number;
  nftContract: string;
  nftTokenId: string;
  seller: string;
  buyer: string;
  quoteTtlMs: number;
}

export interface TradeEvent {
  id: string;
  seq: number;
  type: string;
  from: SettlementState | null;
  to: SettlementState;
  at: number;
  note: string;
}

export interface Trade {
  id: string;
  state: SettlementState;
  quote: QuoteRequest & { quotedAt: number; expiresAt: number };
  reservedUsdc: number;
  xentsRouted: number;
  nftTransferVerified: boolean;
  usdcPayoutVerified: boolean;
  events: TradeEvent[];
}

export interface LiquidityPool {
  availableUsdc: number;
  xentsDepthBps: number;
}

export class InvariantViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvariantViolation";
  }
}

export interface EngineOptions {
  now?: () => number;
  pool?: LiquidityPool;
}

export class MockSettlementEngine {
  readonly liveFundsEnabled = LIVE_FUNDS_ENABLED;
  private readonly now: () => number;
  readonly pool: LiquidityPool;
  private readonly trades = new Map<string, Trade>();
  private readonly seenEventIds = new Set<string>();
  private counter = 0;

  constructor(opts: EngineOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.pool = opts.pool ?? { availableUsdc: 10_000, xentsDepthBps: 0 };
    if (this.liveFundsEnabled !== false) {
      throw new InvariantViolation("LIVE_FUNDS_ENABLED must be false in the mock engine");
    }
  }

  get(tradeId: string): Trade {
    const t = this.trades.get(tradeId);
    if (!t) throw new InvariantViolation(`unknown trade ${tradeId}`);
    return t;
  }

  quote(req: QuoteRequest): Trade {
    if (req.sellerUsdcAmount <= 0) throw new InvariantViolation("seller USDC amount must be positive");
    if (req.xentsExactOut <= 0) throw new InvariantViolation("$XENTS exact-out must be positive");
    const quotedAt = this.now();
    const id = `mock-trade-${++this.counter}`;
    const trade: Trade = {
      id,
      state: "QUOTED",
      quote: { ...req, quotedAt, expiresAt: quotedAt + req.quoteTtlMs },
      reservedUsdc: 0,
      xentsRouted: 0,
      nftTransferVerified: false,
      usdcPayoutVerified: false,
      events: [],
    };
    this.trades.set(id, trade);
    this.appendEvent(trade, `${id}:quote`, "QUOTE_CREATED", null, "QUOTED", "exact-output $XENTS quote created (mock)");
    return trade;
  }

  reserveUsdc(tradeId: string, idem?: string): Trade {
    const t = this.get(tradeId);
    const key = idem ?? `${t.id}:reserve`;
    if (this.seenEventIds.has(key)) return t;
    if (this.expireIfNeeded(t)) return t;
    if (t.state !== "QUOTED") return this.reject(t, "reserveUsdc", "QUOTED");
    if (this.pool.availableUsdc < t.quote.sellerUsdcAmount) {
      return this.transition(t, key, "LIQUIDITY_CHECK_FAILED", "INSUFFICIENT_LIQUIDITY", "seller USDC could not be fully reserved");
    }
    this.pool.availableUsdc -= t.quote.sellerUsdcAmount;
    t.reservedUsdc = t.quote.sellerUsdcAmount;
    return this.transition(t, key, "USDC_RESERVED", "USDC_RESERVED", `reserved ${t.reservedUsdc} USDC (Base) for seller`);
  }

  authorizeInput(tradeId: string, ok = true, idem?: string): Trade {
    const t = this.get(tradeId);
    const key = idem ?? `${t.id}:input`;
    if (this.seenEventIds.has(key)) return t;
    if (this.expireIfNeeded(t)) return t;
    if (t.state !== "USDC_RESERVED") return this.reject(t, "authorizeInput", "USDC_RESERVED");
    if (t.reservedUsdc < t.quote.sellerUsdcAmount) {
      throw new InvariantViolation("buyer funds cannot be accepted before seller USDC is fully reserved");
    }
    if (!ok) return this.transition(t, key, "INPUT_REJECTED", "INPUT_FAILED", `${t.quote.inputRail} input declined (mock)`);
    return this.transition(t, key, "INPUT_AUTHORIZED", "INPUT_AUTHORIZED", `${t.quote.inputRail} input authorized (mock, no funds moved)`);
  }

  routeXents(tradeId: string, realizedXents?: number, idem?: string): Trade {
    const t = this.get(tradeId);
    const key = idem ?? `${t.id}:route`;
    if (this.seenEventIds.has(key)) return t;
    if (t.state !== "INPUT_AUTHORIZED") return this.reject(t, "routeXents", "INPUT_AUTHORIZED");
    const target = t.quote.xentsExactOut;
    const realized = realizedXents ?? target * (1 - this.pool.xentsDepthBps / 10_000);
    const floor = target * (1 - t.quote.maxSlippageBps / 10_000);
    if (realized < floor) {
      this.transition(t, key, "SLIPPAGE_CAP_EXCEEDED", "INSUFFICIENT_LIQUIDITY", `routed ${realized.toFixed(2)} < floor ${floor.toFixed(2)} $XENTS`);
      return this.beginRefund(t.id);
    }
    t.xentsRouted = target;
    return this.transition(t, key, "XENTS_ROUTED", "XENTS_ROUTED", `${target} $XENTS routed to settlement (mock)`);
  }

  beginNftTransfer(tradeId: string, ownerStillSeller = true, idem?: string): Trade {
    const t = this.get(tradeId);
    const key = idem ?? `${t.id}:nft-begin`;
    if (this.seenEventIds.has(key)) return t;
    if (t.state !== "XENTS_ROUTED") return this.reject(t, "beginNftTransfer", "XENTS_ROUTED");
    if (!ownerStillSeller) {
      this.transition(t, key, "OWNERSHIP_RECHECK_FAILED", "NFT_OWNERSHIP_CHANGED", "seller no longer owns the NFT");
      return this.beginRefund(t.id);
    }
    return this.transition(t, key, "NFT_TRANSFER_SUBMITTED", "NFT_TRANSFER_PENDING", `transfer submitted on chain ${t.quote.nftChainId} (mock)`);
  }

  confirmNftTransfer(tradeId: string, outcome: "confirmed" | "failed" | "timeout" = "confirmed", idem?: string): Trade {
    const t = this.get(tradeId);
    const key = idem ?? `${t.id}:nft-confirm`;
    if (this.seenEventIds.has(key)) return t;
    if (t.state !== "NFT_TRANSFER_PENDING") return this.reject(t, "confirmNftTransfer", "NFT_TRANSFER_PENDING");
    if (outcome === "failed") {
      this.transition(t, key, "NFT_TRANSFER_FAILED", "NFT_TRANSFER_FAILED", "transfer reverted (mock)");
      return this.beginRefund(t.id);
    }
    if (outcome === "timeout") {
      this.transition(t, key, "CONFIRMATION_TIMEOUT", "CHAIN_CONFIRMATION_TIMEOUT", "confirmation threshold not reached before timeout");
      return this.manualReview(t.id, "chain confirmation timeout requires operator review");
    }
    t.nftTransferVerified = true;
    return this.transition(t, key, "NFT_TRANSFER_CONFIRMED", "NFT_TRANSFER_CONFIRMED", "confirmation threshold reached (mock)");
  }

  releaseUsdc(tradeId: string, ok = true, idem?: string): Trade {
    const t = this.get(tradeId);
    const key = idem ?? `${t.id}:release`;
    if (this.seenEventIds.has(key)) return t;
    if (t.state !== "NFT_TRANSFER_CONFIRMED") return this.reject(t, "releaseUsdc", "NFT_TRANSFER_CONFIRMED");
    if (!t.nftTransferVerified) throw new InvariantViolation("USDC cannot be released before NFT transfer is verified");
    if (!ok) {
      this.transition(t, key, "USDC_PAYOUT_FAILED", "USDC_PAYOUT_FAILED", "payout leg failed after NFT moved; reserved USDC held");
      return this.manualReview(t.id, "payout failure with transferred NFT requires operator review");
    }
    t.usdcPayoutVerified = true;
    return this.transition(t, key, "USDC_RELEASED", "USDC_RELEASED", `${t.reservedUsdc} USDC released to seller (mock)`);
  }

  finalizeReceipt(tradeId: string, idem?: string): Trade {
    const t = this.get(tradeId);
    const key = idem ?? `${t.id}:finalize`;
    if (this.seenEventIds.has(key)) return t;
    if (t.state !== "USDC_RELEASED") return this.reject(t, "finalizeReceipt", "USDC_RELEASED");
    if (!(t.nftTransferVerified && t.usdcPayoutVerified)) {
      throw new InvariantViolation("cannot finalize: NFT transfer and USDC payout must both be verified");
    }
    return this.transition(t, key, "RECEIPT_FINALIZED", "RECEIPT_FINALIZED", "dual verification complete; receipt finalized (mock)");
  }

  beginRefund(tradeId: string, idem?: string): Trade {
    const t = this.get(tradeId);
    const key = idem ?? `${t.id}:refund-begin`;
    if (this.seenEventIds.has(key)) return t;
    if (!ALLOWED_TRANSITIONS[t.state].includes("REFUND_PENDING")) return this.reject(t, "beginRefund", "refundable state");
    this.releaseReservation(t);
    return this.transition(t, key, "REFUND_INITIATED", "REFUND_PENDING", "compensating refund initiated (mock)");
  }

  completeRefund(tradeId: string, idem?: string): Trade {
    const t = this.get(tradeId);
    const key = idem ?? `${t.id}:refund-done`;
    if (this.seenEventIds.has(key)) return t;
    if (t.state !== "REFUND_PENDING") return this.reject(t, "completeRefund", "REFUND_PENDING");
    return this.transition(t, key, "REFUNDED", "REFUNDED", "buyer input refunded (mock)");
  }

  manualReview(tradeId: string, reason: string, idem?: string): Trade {
    const t = this.get(tradeId);
    const key = idem ?? `${t.id}:manual-review`;
    if (this.seenEventIds.has(key)) return t;
    if (!ALLOWED_TRANSITIONS[t.state].includes("MANUAL_REVIEW")) return this.reject(t, "manualReview", "reviewable state");
    return this.transition(t, key, "ESCALATED", "MANUAL_REVIEW", reason);
  }

  private expireIfNeeded(t: Trade): boolean {
    if (this.now() <= t.quote.expiresAt) return false;
    if (!ALLOWED_TRANSITIONS[t.state].includes("QUOTE_EXPIRED")) return false;
    this.releaseReservation(t);
    this.transition(t, `${t.id}:expire`, "QUOTE_EXPIRED", "QUOTE_EXPIRED", "quote TTL elapsed before settlement");
    return true;
  }

  private releaseReservation(t: Trade): void {
    if (t.reservedUsdc > 0) {
      this.pool.availableUsdc += t.reservedUsdc;
      t.reservedUsdc = 0;
    }
  }

  private reject(t: Trade, op: string, expected: string): never {
    throw new InvariantViolation(`${op} requires state ${expected}, trade ${t.id} is ${t.state}`);
  }

  private transition(t: Trade, eventId: string, type: string, to: SettlementState, note: string): Trade {
    if (!ALLOWED_TRANSITIONS[t.state].includes(to)) {
      throw new InvariantViolation(`illegal transition ${t.state} -> ${to}`);
    }
    this.appendEvent(t, eventId, type, t.state, to, note);
    t.state = to;
    return t;
  }

  private appendEvent(t: Trade, id: string, type: string, from: SettlementState | null, to: SettlementState, note: string): void {
    if (this.seenEventIds.has(id)) return;
    this.seenEventIds.add(id);
    t.events.push({ id, seq: t.events.length, type, from, to, at: this.now(), note });
  }
}

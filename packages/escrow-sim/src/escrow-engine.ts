// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — escrow-sim / escrow-engine
//
// SIMULATION ONLY. NEW implementation built Nov 22, 2026 for mentorship
// INTEGRATE task I-3. NOT the PAYRAIL54 v2 SQL. NOT a recovery. NOT a
// P0/P1 remediation. Does not verify CIP-54, the issuer adapter, or the
// FA54/issuer workers. D-3 stays BLOCKED.
//
// EscrowEngine: create, fund, release, refund, dispute over an in-memory
// SQLite store (SQL-RECOVERY-REPORT.md Section 5.2 and 5.3). The ALLOW
// receipt and the completion-evidence record are opaque caller-supplied data
// inputs, never live calls: this engine never calls ENTITY54, PAYRAIL, any
// chain, wallet, or network.
//
// FUND ACCOUNTING (forced by invariant 1): the four buckets partition the
// opening pool balance at every receipt. fund moves funds out of the pool
// into escrow; release moves them from escrow into the released bucket
// (the seller); refund moves them from escrow into the refunded bucket
// (the buyer). The pool balance itself therefore changes only at fund.
// Any other accounting would break pool + escrowed + released + refunded
// = opening after a refund. DISPUTED escrows stay in the escrowed bucket
// until release or refund closes them.
// ---------------------------------------------------------------------------

import {
  ALLOWED_TRANSITIONS,
  isTransitionAllowed,
  type EscrowState,
  type EscrowTransition,
} from "./escrow-states";
import {
  GENESIS_PREV_HASH,
  canonicalJson,
  sealReceipt,
  verifyReceiptChain,
  type EscrowBalances,
  type EscrowReceipt,
  type EscrowReceiptBody,
} from "./escrow-receipt";
import { EscrowStore } from "./escrow-store";

/** Live funds are permanently disabled in this simulation. */
export const LIVE_FUNDS_ENABLED = false as const;

/** Thrown for illegal transitions, failed gates, and invariant violations. */
export class InvariantViolation extends Error {
  constructor(message: string) {
    super(`InvariantViolation: ${message}`);
    this.name = "InvariantViolation";
  }
}

/** A valid escrow creation request (Section 5.2, create gate). */
export interface EscrowRequest {
  /** Amount in integer minor units. Must be a positive bigint; no floats. */
  amount: bigint;
  asset: string;
  buyer: string;
  seller: string;
  /** ISO date string; must be after the engine clock. */
  expiry: string;
}

/** Options for a new engine. The clock is fixed, never wall-clock time. */
export interface EscrowEngineOptions {
  /** Opening simulated pool balance, integer minor units. */
  openingPoolBalance: bigint;
  /** Fixed clock value carried on every receipt (ISO date string). */
  clock: string;
}

/** Funds buckets with bigint amounts. */
export interface EscrowBalancesBigInt {
  pool: bigint;
  escrowed: bigint;
  released: bigint;
  refunded: bigint;
  opening: bigint;
}

/** Public view of one escrow. */
export interface EscrowView {
  id: string;
  state: EscrowState;
  amount: bigint;
  asset: string;
  buyer: string;
  seller: string;
  expiry: string;
}

/** Opaque caller-supplied gate inputs for release. */
export interface ReleaseInput {
  /** Opaque ENTITY54 ALLOW receipt for the release. */
  authorizationReceipt: string;
  /** Opaque completion-evidence record. */
  completionEvidence: string;
}

/** Opaque caller-supplied gate input for refund. */
export interface RefundInput {
  /** Opaque ENTITY54 ALLOW receipt for the refund. */
  authorizationReceipt: string;
}

/** The simulation-only escrow state machine. */
export class EscrowEngine {
  private readonly store: EscrowStore;
  private readonly clock: string;

  constructor(options: EscrowEngineOptions) {
    if (typeof options.clock !== "string" || options.clock.trim().length === 0) {
      throw new InvariantViolation("EscrowEngine: clock must be a non-empty string");
    }
    if (Number.isNaN(Date.parse(options.clock))) {
      throw new InvariantViolation("EscrowEngine: clock must be a valid ISO date string");
    }
    this.clock = options.clock;
    this.store = new EscrowStore(options.openingPoolBalance);
  }

  // -------------------------------------------------------------------------
  // Transitions (Section 5.2)
  // -------------------------------------------------------------------------

  /** Create a new escrow in CREATED and write a creation receipt. */
  create(eventId: string, request: EscrowRequest): EscrowReceipt {
    this.requireEventId(eventId);
    const replayed = this.replayIfSeen(eventId);
    if (replayed !== undefined) return replayed;
    this.validateRequest(request);
    return this.store.runInTransaction(() => {
      const seq = this.store.nextReceiptSeq();
      const escrowId = `escrow-${String(seq).padStart(6, "0")}`;
      this.store.insertEscrow({
        id: escrowId,
        state: "CREATED",
        amount: request.amount.toString(),
        asset: request.asset,
        buyer: request.buyer,
        seller: request.seller,
        expiry: request.expiry,
      });
      return this.sealAndRecord({
        eventId,
        transition: "create",
        escrowId,
        fromState: null,
        toState: "CREATED",
        amount: request.amount.toString(),
        asset: request.asset,
        buyer: request.buyer,
        seller: request.seller,
        expiry: request.expiry,
        authorizationReceipt: null,
        completionEvidence: null,
      });
    });
  }

  /** Fund a CREATED escrow; the pool balance decreases by the amount. */
  fund(eventId: string, escrowId: string): EscrowReceipt {
    this.requireEventId(eventId);
    const replayed = this.replayIfSeen(eventId);
    if (replayed !== undefined) return replayed;
    const escrow = this.requireEscrow(escrowId);
    this.requireAllowed("fund", escrow.state);
    const amount = BigInt(escrow.amount);
    if (amount > this.store.getPoolBalance()) {
      throw new InvariantViolation(
        `fund: escrow ${escrowId} amount ${amount} exceeds pool balance ${this.store.getPoolBalance()}`,
      );
    }
    return this.store.runInTransaction(() => {
      this.store.updateEscrowState(escrowId, "FUNDED");
      this.store.setPoolBalance(this.store.getPoolBalance() - amount);
      return this.sealAndRecord({
        eventId,
        transition: "fund",
        escrowId,
        fromState: escrow.state,
        toState: "FUNDED",
        amount: escrow.amount,
        asset: escrow.asset,
        buyer: escrow.buyer,
        seller: escrow.seller,
        expiry: escrow.expiry,
        authorizationReceipt: null,
        completionEvidence: null,
      });
    });
  }

  /**
   * Release a FUNDED or DISPUTED escrow. Requires BOTH an ENTITY54 ALLOW
   * receipt AND a completion-evidence record. Never executes on an
   * unsupported completion claim.
   */
  release(
    eventId: string,
    escrowId: string,
    input: ReleaseInput,
  ): EscrowReceipt {
    this.requireEventId(eventId);
    const replayed = this.replayIfSeen(eventId);
    if (replayed !== undefined) return replayed;
    const escrow = this.requireEscrow(escrowId);
    this.requireAllowed("release", escrow.state);
    const authorizationReceipt = this.requireOpaque(
      input.authorizationReceipt,
      "release: authorizationReceipt",
    );
    const completionEvidence = this.requireOpaque(
      input.completionEvidence,
      "release: completionEvidence",
    );
    return this.store.runInTransaction(() => {
      this.store.updateEscrowState(escrowId, "RELEASED");
      return this.sealAndRecord({
        eventId,
        transition: "release",
        escrowId,
        fromState: escrow.state,
        toState: "RELEASED",
        amount: escrow.amount,
        asset: escrow.asset,
        buyer: escrow.buyer,
        seller: escrow.seller,
        expiry: escrow.expiry,
        authorizationReceipt,
        completionEvidence,
      });
    });
  }

  /** Refund a FUNDED or DISPUTED escrow. Requires an ALLOW receipt. */
  refund(eventId: string, escrowId: string, input: RefundInput): EscrowReceipt {
    this.requireEventId(eventId);
    const replayed = this.replayIfSeen(eventId);
    if (replayed !== undefined) return replayed;
    const escrow = this.requireEscrow(escrowId);
    this.requireAllowed("refund", escrow.state);
    const authorizationReceipt = this.requireOpaque(
      input.authorizationReceipt,
      "refund: authorizationReceipt",
    );
    return this.store.runInTransaction(() => {
      this.store.updateEscrowState(escrowId, "REFUNDED");
      return this.sealAndRecord({
        eventId,
        transition: "refund",
        escrowId,
        fromState: escrow.state,
        toState: "REFUNDED",
        amount: escrow.amount,
        asset: escrow.asset,
        buyer: escrow.buyer,
        seller: escrow.seller,
        expiry: escrow.expiry,
        authorizationReceipt,
        completionEvidence: null,
      });
    });
  }

  /** Open a dispute on a FUNDED escrow. No direct return to FUNDED. */
  dispute(eventId: string, escrowId: string): EscrowReceipt {
    this.requireEventId(eventId);
    const replayed = this.replayIfSeen(eventId);
    if (replayed !== undefined) return replayed;
    const escrow = this.requireEscrow(escrowId);
    this.requireAllowed("dispute", escrow.state);
    return this.store.runInTransaction(() => {
      this.store.updateEscrowState(escrowId, "DISPUTED");
      return this.sealAndRecord({
        eventId,
        transition: "dispute",
        escrowId,
        fromState: escrow.state,
        toState: "DISPUTED",
        amount: escrow.amount,
        asset: escrow.asset,
        buyer: escrow.buyer,
        seller: escrow.seller,
        expiry: escrow.expiry,
        authorizationReceipt: null,
        completionEvidence: null,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** Public view of one escrow, or undefined when it does not exist. */
  getEscrow(escrowId: string): EscrowView | undefined {
    const row = this.store.getEscrow(escrowId);
    if (row === undefined) return undefined;
    return {
      id: row.id,
      state: row.state,
      amount: BigInt(row.amount),
      asset: row.asset,
      buyer: row.buyer,
      seller: row.seller,
      expiry: row.expiry,
    };
  }

  /** Current funds buckets (bigint minor units). */
  balances(): EscrowBalancesBigInt {
    return this.computeBalances();
  }

  /** All receipts in chain order. */
  receipts(): EscrowReceipt[] {
    return this.store.getReceipts();
  }

  /** Verify the receipt chain by independent hash recomputation. */
  verifyChain(): boolean {
    return verifyReceiptChain(this.store.getReceipts());
  }

  /** Close the underlying store. */
  close(): void {
    this.store.close();
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private requireEventId(eventId: string): void {
    if (typeof eventId !== "string" || eventId.trim().length === 0) {
      throw new InvariantViolation("eventId must be a non-empty string");
    }
  }

  /** Idempotency: a replayed event id returns the original receipt. */
  private replayIfSeen(eventId: string): EscrowReceipt | undefined {
    const receiptHash = this.store.findReceiptHashByEventId(eventId);
    if (receiptHash === undefined) return undefined;
    return this.store.getReceipts().find((receipt) => receipt.hash === receiptHash);
  }

  private requireEscrow(escrowId: string): {
    id: string;
    state: EscrowState;
    amount: string;
    asset: string;
    buyer: string;
    seller: string;
    expiry: string;
  } {
    const escrow = this.store.getEscrow(escrowId);
    if (escrow === undefined) {
      throw new InvariantViolation(`escrow ${escrowId} does not exist`);
    }
    return escrow;
  }

  private requireAllowed(transition: EscrowTransition, from: EscrowState): void {
    if (!isTransitionAllowed(transition, from)) {
      const allowed = ALLOWED_TRANSITIONS[transition].from.join(", ");
      throw new InvariantViolation(
        `${transition} is not allowed from ${from} (allowed from: ${allowed})`,
      );
    }
  }

  private requireOpaque(value: unknown, name: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new InvariantViolation(`${name} is required and must be a non-empty string`);
    }
    return value;
  }

  private validateRequest(request: EscrowRequest): void {
    if (typeof request.amount !== "bigint" || request.amount <= 0n) {
      throw new InvariantViolation(
        "create: amount must be a positive integer (minor units, no floats)",
      );
    }
    for (const [field, value] of [
      ["asset", request.asset],
      ["buyer", request.buyer],
      ["seller", request.seller],
      ["expiry", request.expiry],
    ] as const) {
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new InvariantViolation(`create: ${field} must be a non-empty string`);
      }
    }
    if (Number.isNaN(Date.parse(request.expiry))) {
      throw new InvariantViolation("create: expiry must be a valid ISO date string");
    }
    if (Date.parse(request.expiry) <= Date.parse(this.clock)) {
      throw new InvariantViolation("create: expiry must be after the engine clock");
    }
  }

  private computeBalances(): EscrowBalancesBigInt {
    const opening = this.store.getOpeningBalance();
    const pool = this.store.getPoolBalance();
    let escrowed = 0n;
    let released = 0n;
    let refunded = 0n;
    for (const row of this.store.listEscrows()) {
      const amount = BigInt(row.amount);
      if (row.state === "FUNDED" || row.state === "DISPUTED") {
        escrowed += amount;
      } else if (row.state === "RELEASED") {
        released += amount;
      } else if (row.state === "REFUNDED") {
        refunded += amount;
      }
    }
    return { pool, escrowed, released, refunded, opening };
  }

  private assertConservation(balances: EscrowBalancesBigInt): void {
    const total =
      balances.pool + balances.escrowed + balances.released + balances.refunded;
    if (total !== balances.opening) {
      throw new InvariantViolation(
        `conservation violated: pool ${balances.pool} + escrowed ${balances.escrowed} + released ${balances.released} + refunded ${balances.refunded} = ${total}, expected opening ${balances.opening}`,
      );
    }
  }

  private balancesAsStrings(balances: EscrowBalancesBigInt): EscrowBalances {
    return {
      pool: balances.pool.toString(),
      escrowed: balances.escrowed.toString(),
      released: balances.released.toString(),
      refunded: balances.refunded.toString(),
      opening: balances.opening.toString(),
    };
  }

  /**
   * Build, hash, and record a receipt for a transition whose state change
   * is already applied inside the caller's transaction. Checks conservation
   * before writing anything, so a failed check rolls the transition back.
   */
  private sealAndRecord(
    input: Omit<EscrowReceiptBody, "version" | "seq" | "balances" | "clock" | "prevHash">,
  ): EscrowReceipt {
    const balances = this.computeBalances();
    this.assertConservation(balances);
    const body: EscrowReceiptBody = {
      version: 1,
      seq: this.store.nextReceiptSeq(),
      eventId: input.eventId,
      escrowId: input.escrowId,
      transition: input.transition,
      fromState: input.fromState,
      toState: input.toState,
      amount: input.amount,
      asset: input.asset,
      buyer: input.buyer,
      seller: input.seller,
      expiry: input.expiry,
      authorizationReceipt: input.authorizationReceipt,
      completionEvidence: input.completionEvidence,
      balances: this.balancesAsStrings(balances),
      clock: this.clock,
      prevHash: this.store.lastReceiptHash() ?? GENESIS_PREV_HASH,
    };
    const receipt = sealReceipt(body);
    this.store.insertReceipt({
      seq: receipt.seq,
      hash: receipt.hash,
      prevHash: receipt.prevHash,
      canonicalJson: canonicalJson(receipt),
    });
    this.store.insertEvent(input.eventId, receipt.hash);
    return receipt;
  }
}

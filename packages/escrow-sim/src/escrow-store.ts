// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — escrow-sim / escrow-store
//
// SIMULATION ONLY. NEW implementation built Nov 22, 2026 for mentorship
// INTEGRATE task I-3. NOT the PAYRAIL54 v2 SQL. NOT a recovery. NOT a
// P0/P1 remediation. Does not verify CIP-54, the issuer adapter, or the
// FA54/issuer workers. D-3 stays BLOCKED.
//
// SQLite persistence for the simulation-only escrow state machine, following
// the PR #23 simulation pattern: in-memory database, no network, no keys,
// no live funds. Schema only; no migration of any existing data. Money is
// stored as decimal-string minor units, never as floats.
// ---------------------------------------------------------------------------

import { DatabaseSync } from "node:sqlite";

import type { EscrowState } from "./escrow-states";
import type { EscrowReceipt } from "./escrow-receipt";

/** One escrow row as stored. Amount is integer minor units, decimal string. */
export interface EscrowRow {
  id: string;
  state: EscrowState;
  amount: string;
  asset: string;
  buyer: string;
  seller: string;
  expiry: string;
}

/** One receipt row as stored. */
export interface ReceiptRow {
  seq: number;
  hash: string;
  prevHash: string;
  canonicalJson: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS escrows (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  amount TEXT NOT NULL,
  asset TEXT NOT NULL,
  buyer TEXT NOT NULL,
  seller TEXT NOT NULL,
  expiry TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS receipts (
  seq INTEGER PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  prev_hash TEXT NOT NULL,
  canonical_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  receipt_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pool (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  opening_balance TEXT NOT NULL,
  balance TEXT NOT NULL
);
`;

/** In-memory SQLite store for escrows, receipts, event ids, and the pool. */
export class EscrowStore {
  private readonly db: DatabaseSync;
  private readonly openingBalance: bigint;

  constructor(openingPoolBalance: bigint) {
    if (openingPoolBalance < 0n) {
      throw new Error("EscrowStore: opening pool balance must be non-negative");
    }
    this.openingBalance = openingPoolBalance;
    this.db = new DatabaseSync(":memory:");
    this.db.exec(SCHEMA);
    this.db
      .prepare("INSERT INTO pool (id, opening_balance, balance) VALUES (1, ?, ?)")
      .run(openingPoolBalance.toString(), openingPoolBalance.toString());
  }

  /** Run fn inside a single SQLite transaction; rolls back on any throw. */
  runInTransaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Escrows
  // -------------------------------------------------------------------------

  insertEscrow(row: EscrowRow): void {
    this.db
      .prepare(
        "INSERT INTO escrows (id, state, amount, asset, buyer, seller, expiry) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(row.id, row.state, row.amount, row.asset, row.buyer, row.seller, row.expiry);
  }

  getEscrow(id: string): EscrowRow | undefined {
    const row = this.db
      .prepare("SELECT id, state, amount, asset, buyer, seller, expiry FROM escrows WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (row === undefined) return undefined;
    return {
      id: String(row["id"]),
      state: String(row["state"]) as EscrowState,
      amount: String(row["amount"]),
      asset: String(row["asset"]),
      buyer: String(row["buyer"]),
      seller: String(row["seller"]),
      expiry: String(row["expiry"]),
    };
  }

  updateEscrowState(id: string, state: EscrowState): void {
    this.db.prepare("UPDATE escrows SET state = ? WHERE id = ?").run(state, id);
  }

  listEscrows(): EscrowRow[] {
    const rows = this.db
      .prepare("SELECT id, state, amount, asset, buyer, seller, expiry FROM escrows ORDER BY id")
      .all() as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row["id"]),
      state: String(row["state"]) as EscrowState,
      amount: String(row["amount"]),
      asset: String(row["asset"]),
      buyer: String(row["buyer"]),
      seller: String(row["seller"]),
      expiry: String(row["expiry"]),
    }));
  }

  // -------------------------------------------------------------------------
  // Receipts and event ids
  // -------------------------------------------------------------------------

  /** Next receipt sequence number (1-based, deterministic in operation order). */
  nextReceiptSeq(): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM receipts")
      .get() as Record<string, unknown> | undefined;
    const maxSeq = row === undefined ? 0 : Number(row["max_seq"]);
    return maxSeq + 1;
  }

  /** Hash of the most recent receipt, or null when the chain is empty. */
  lastReceiptHash(): string | null {
    const row = this.db
      .prepare("SELECT hash FROM receipts ORDER BY seq DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;
    return row === undefined ? null : String(row["hash"]);
  }

  insertReceipt(receipt: ReceiptRow): void {
    this.db
      .prepare(
        "INSERT INTO receipts (seq, hash, prev_hash, canonical_json) VALUES (?, ?, ?, ?)",
      )
      .run(receipt.seq, receipt.hash, receipt.prevHash, receipt.canonicalJson);
  }

  getReceipts(): EscrowReceipt[] {
    const rows = this.db
      .prepare("SELECT canonical_json FROM receipts ORDER BY seq")
      .all() as Record<string, unknown>[];
    return rows.map(
      (row) => JSON.parse(String(row["canonical_json"])) as EscrowReceipt,
    );
  }

  findReceiptHashByEventId(eventId: string): string | undefined {
    const row = this.db
      .prepare("SELECT receipt_hash FROM events WHERE event_id = ?")
      .get(eventId) as Record<string, unknown> | undefined;
    return row === undefined ? undefined : String(row["receipt_hash"]);
  }

  insertEvent(eventId: string, receiptHash: string): void {
    this.db
      .prepare("INSERT INTO events (event_id, receipt_hash) VALUES (?, ?)")
      .run(eventId, receiptHash);
  }

  // -------------------------------------------------------------------------
  // Pool
  // -------------------------------------------------------------------------

  getOpeningBalance(): bigint {
    return this.openingBalance;
  }

  getPoolBalance(): bigint {
    const row = this.db
      .prepare("SELECT balance FROM pool WHERE id = 1")
      .get() as Record<string, unknown> | undefined;
    if (row === undefined) {
      throw new Error("EscrowStore: pool row is missing");
    }
    return BigInt(String(row["balance"]));
  }

  setPoolBalance(balance: bigint): void {
    if (balance < 0n) {
      throw new Error("EscrowStore: pool balance must be non-negative");
    }
    this.db.prepare("UPDATE pool SET balance = ? WHERE id = 1").run(balance.toString());
  }

  close(): void {
    this.db.close();
  }
}

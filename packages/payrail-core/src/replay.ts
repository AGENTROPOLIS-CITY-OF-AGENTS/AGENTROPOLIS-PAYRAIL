// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — payrail-core / replay
//
// Replay / idempotency scaffolding.
//
// ⚠️  NON-DURABLE / NOT PRODUCTION COMPLETE.
// This is an in-memory ReplayGuard used to prove the replay-detection
// contract. It resets on process restart and is NOT a durable replay record.
// Phase 1 must replace it with a persistent store (SQLite/Postgres/Redis)
// before any live settlement is enabled.
//
// Contract:
//   - every settlement carries a unique idempotencyKey;
//   - a duplicate idempotencyKey is detected and refused;
//   - a retry of the SAME key returns the prior outcome (idempotent replay);
//   - no "success" receipt is issued before verified finality.
// ---------------------------------------------------------------------------

import type { SettlementOutcome } from "./status";

/** A recorded replay entry. */
export interface ReplayRecord {
  idempotencyKey: string;
  outcome: SettlementOutcome;
  firstSeenAt: string; // ISO 8601
}

/**
 * In-memory replay guard.
 *
 * ⚠️  NON-DURABLE — resets on restart. NOT PRODUCTION COMPLETE.
 */
export class ReplayGuard {
  /** Explicit marker so callers cannot mistake this for durable storage. */
  readonly durable = false;
  readonly nonDurable = true;
  readonly productionComplete = false;

  private readonly records = new Map<string, ReplayRecord>();

  /**
   * Check whether an idempotency key has already been seen.
   * Returns the prior record if present, else undefined.
   */
  lookup(idempotencyKey: string): ReplayRecord | undefined {
    return this.records.get(idempotencyKey);
  }

  /**
   * True if the key has already been recorded (a replay / duplicate).
   */
  isReplay(idempotencyKey: string): boolean {
    return this.records.has(idempotencyKey);
  }

  /**
   * Record an outcome for an idempotency key.
   * Throws if the key is already recorded (call isReplay first, or use
   * recordIfAbsent for idempotent semantics).
   */
  record(idempotencyKey: string, outcome: SettlementOutcome): ReplayRecord {
    if (this.records.has(idempotencyKey)) {
      throw new Error(
        `ReplayGuard: idempotency key "${idempotencyKey}" already recorded (replay detected)`,
      );
    }
    const record: ReplayRecord = {
      idempotencyKey,
      outcome,
      firstSeenAt: new Date().toISOString(),
    };
    this.records.set(idempotencyKey, record);
    return record;
  }

  /**
   * Idempotent record: if the key is already present, return the prior record
   * unchanged; otherwise record the new outcome. This is the safe path for
   * retries — a retried key returns the original outcome, never a new one.
   */
  recordIfAbsent(idempotencyKey: string, outcome: SettlementOutcome): ReplayRecord {
    const existing = this.records.get(idempotencyKey);
    if (existing) return existing;
    return this.record(idempotencyKey, outcome);
  }

  /** Number of recorded keys. */
  get size(): number {
    return this.records.size;
  }

  /** Clear all records (test / reset helper). */
  clear(): void {
    this.records.clear();
  }
}

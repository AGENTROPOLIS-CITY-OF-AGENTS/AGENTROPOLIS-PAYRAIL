// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — payrail-core / replay
// ---------------------------------------------------------------------------

import type { SettlementOutcome } from "./status";

export interface ReplayRecord {
  idempotencyKey: string;
  outcome: SettlementOutcome;
  firstSeenAt: string;
}

export class ReplayGuard {
  readonly durable = false;
  readonly nonDurable = true;
  readonly productionComplete = false;

  private readonly records = new Map<string, ReplayRecord>();
  private readonly reservations = new Set<string>();

  lookup(idempotencyKey: string): ReplayRecord | undefined {
    return this.records.get(idempotencyKey);
  }

  isReplay(idempotencyKey: string): boolean {
    return this.records.has(idempotencyKey) || this.reservations.has(idempotencyKey);
  }

  tryReserve(idempotencyKey: string): boolean {
    if (this.isReplay(idempotencyKey)) return false;
    this.reservations.add(idempotencyKey);
    return true;
  }

  completeReservation(
    idempotencyKey: string,
    outcome: SettlementOutcome,
  ): ReplayRecord {
    if (!this.reservations.has(idempotencyKey)) {
      throw new Error(`ReplayGuard: idempotency key "${idempotencyKey}" is not reserved`);
    }

    this.reservations.delete(idempotencyKey);
    return this.record(idempotencyKey, outcome);
  }

  releaseReservation(idempotencyKey: string): void {
    this.reservations.delete(idempotencyKey);
  }

  record(idempotencyKey: string, outcome: SettlementOutcome): ReplayRecord {
    if (this.isReplay(idempotencyKey)) {
      throw new Error(
        `ReplayGuard: idempotency key "${idempotencyKey}" already recorded or reserved (replay detected)`,
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

  recordIfAbsent(idempotencyKey: string, outcome: SettlementOutcome): ReplayRecord {
    const existing = this.records.get(idempotencyKey);
    if (existing) return existing;
    if (this.reservations.has(idempotencyKey)) {
      throw new Error(
        `ReplayGuard: idempotency key "${idempotencyKey}" is currently reserved`,
      );
    }
    return this.record(idempotencyKey, outcome);
  }

  get size(): number {
    return this.records.size;
  }

  get reservedSize(): number {
    return this.reservations.size;
  }

  clear(): void {
    this.records.clear();
    this.reservations.clear();
  }
}

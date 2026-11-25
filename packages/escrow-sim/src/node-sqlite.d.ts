// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — escrow-sim / node-sqlite.d.ts
//
// SIMULATION ONLY. NEW implementation built Nov 22, 2026 for mentorship
// INTEGRATE task I-3. NOT the PAYRAIL54 v2 SQL. NOT a recovery. NOT a
// P0/P1 remediation. Does not verify CIP-54, the issuer adapter, or the
// FA54/issuer workers. D-3 stays BLOCKED.
//
// Minimal ambient types for Node's built-in node:sqlite (DatabaseSync).
// @types/node 20 does not declare node:sqlite; this file types only the
// surface this package uses. Prefer this over bumping any dependency version.
// ---------------------------------------------------------------------------

declare module "node:sqlite" {
  export interface StatementSync {
    run(
      ...params: unknown[]
    ): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }

  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
    location?: string;
  }

  export class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

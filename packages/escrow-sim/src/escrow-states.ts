// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — escrow-sim / escrow-states
//
// SIMULATION ONLY. NEW implementation built Nov 22, 2026 for mentorship
// INTEGRATE task I-3. NOT the PAYRAIL54 v2 SQL. NOT a recovery. NOT a
// P0/P1 remediation. Does not verify CIP-54, the issuer adapter, or the
// FA54/issuer workers. D-3 stays BLOCKED.
//
// State names, the allowed-transition table, and terminal states for the
// simulation-only escrow state machine (SQL-RECOVERY-REPORT.md Section 5.2).
// ---------------------------------------------------------------------------

/** Escrow lifecycle states (Section 5.2). */
export type EscrowState =
  | "CREATED"
  | "FUNDED"
  | "RELEASED"
  | "REFUNDED"
  | "DISPUTED";

/** Terminal states: a terminal escrow rejects further transitions. */
export const TERMINAL_STATES: ReadonlySet<EscrowState> = new Set([
  "RELEASED",
  "REFUNDED",
]);

/** Transitions of the escrow state machine (Section 5.2). */
export type EscrowTransition =
  | "create"
  | "fund"
  | "release"
  | "refund"
  | "dispute";

/**
 * Allowed transitions, keyed by transition name. `from` lists every state a
 * transition may start from; `to` is the state it lands in. `create` has no
 * from-state: it mints a new escrow in CREATED.
 *
 * - fund:    CREATED -> FUNDED
 * - release: FUNDED -> RELEASED, DISPUTED -> RELEASED (evidence + auth)
 * - refund:  FUNDED -> REFUNDED, DISPUTED -> REFUNDED (auth)
 * - dispute: FUNDED -> DISPUTED (no direct return to FUNDED)
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<EscrowTransition, { from: readonly (EscrowState | null)[]; to: EscrowState }>
> = {
  create: { from: [null], to: "CREATED" },
  fund: { from: ["CREATED"], to: "FUNDED" },
  release: { from: ["FUNDED", "DISPUTED"], to: "RELEASED" },
  refund: { from: ["FUNDED", "DISPUTED"], to: "REFUNDED" },
  dispute: { from: ["FUNDED"], to: "DISPUTED" },
};

/** True if the transition may start from the given state. */
export function isTransitionAllowed(
  transition: EscrowTransition,
  from: EscrowState | null,
): boolean {
  return ALLOWED_TRANSITIONS[transition].from.includes(from);
}

/** True if the state is terminal (RELEASED or REFUNDED). */
export function isTerminalState(state: EscrowState): boolean {
  return TERMINAL_STATES.has(state);
}

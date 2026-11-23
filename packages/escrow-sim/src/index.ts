// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — escrow-sim
//
// SIMULATION ONLY. NEW implementation built Nov 22, 2026 for mentorship
// INTEGRATE task I-3. NOT the PAYRAIL54 v2 SQL. NOT a recovery. NOT a
// P0/P1 remediation. Does not verify CIP-54, the issuer adapter, or the
// FA54/issuer workers. D-3 stays BLOCKED.
//
// Public export surface of the simulation-only escrow state machine.
//
// The live rules are NOT exported here (Defect 2 fix, Nov 22, 2026):
// ALLOWED_TRANSITIONS and TERMINAL_STATES stay inside escrow-states.ts,
// where they are deep-frozen at module load. Package consumers get only
// the predicate functions and the types, so no caller can reach or mutate
// the rules the engine enforces.
// ---------------------------------------------------------------------------

export { isTransitionAllowed, isTerminalState } from "./escrow-states";
export type { EscrowState, EscrowTransition } from "./escrow-states";
export * from "./escrow-receipt";
export * from "./escrow-store";
export * from "./escrow-engine";

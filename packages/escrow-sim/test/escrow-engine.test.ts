// ---------------------------------------------------------------------------
// AGENTROPOLIS-PAYRAIL — escrow-sim / test
//
// SIMULATION ONLY. NEW implementation built Nov 22, 2026 for mentorship
// INTEGRATE task I-3. NOT the PAYRAIL54 v2 SQL. NOT a recovery. NOT a
// P0/P1 remediation. Does not verify CIP-54, the issuer adapter, or the
// FA54/issuer workers. D-3 stays BLOCKED.
//
// Unit tests for the simulation-only escrow state machine
// (SQL-RECOVERY-REPORT.md Section 5.5, 17 tests, including the live-funds
// guard test "live funds stay disabled in the simulation"). Uses node:test,
// like the repo's existing tests.
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  EscrowEngine,
  InvariantViolation,
  LIVE_FUNDS_ENABLED,
  SUPPORTED_EVIDENCE_KINDS,
  isSupportedEvidenceKind,
  type AuthorizationReceipt,
  type CompletionEvidence,
  type CompletionEvidenceKind,
  type EscrowRequest,
  type ReleaseInput,
} from "../src/escrow-engine.js";
import {
  ALLOWED_TRANSITIONS,
  TERMINAL_STATES,
  isTerminalState,
  isTransitionAllowed,
} from "../src/escrow-states.js";
import {
  GENESIS_PREV_HASH,
  verifyReceiptChain,
  type EscrowReceipt,
} from "../src/escrow-receipt.js";
import * as escrowSim from "../src/index.js";

const CLOCK = "2026-11-22T00:00:00.000Z";
const OPENING = 1_000_000n;
const AMOUNT = 50_000n;

function makeEngine(): EscrowEngine {
  return new EscrowEngine({ openingPoolBalance: OPENING, clock: CLOCK });
}

function makeRequest(amount: bigint = AMOUNT): EscrowRequest {
  return {
    amount,
    asset: "USDC",
    buyer: "buyer-1",
    seller: "seller-1",
    expiry: "2027-01-01T00:00:00.000Z",
  };
}

/** Typed ALLOW receipt fixture for release/refund. */
function allowReceipt(receiptId: string = "allow-receipt-1"): AuthorizationReceipt {
  return { decision: "ALLOW", receiptId };
}

/** Typed DENY receipt fixture: must always be refused. */
function denyReceipt(receiptId: string = "deny-receipt-1"): AuthorizationReceipt {
  return { decision: "DENY", receiptId };
}

/** Typed completion-evidence fixture for release. */
function completionEvidence(
  kind: CompletionEvidenceKind = "delivery-confirmed",
  reference: string = "delivery-proof-1",
): CompletionEvidence {
  return { kind, reference };
}

/** A complete, valid release input. */
function releaseInput(): ReleaseInput {
  return {
    authorizationReceipt: allowReceipt(),
    completionEvidence: completionEvidence(),
  };
}

/** pool + escrowed + released + refunded must equal the opening balance. */
function assertConserved(engine: EscrowEngine): void {
  const b = engine.balances();
  assert.equal(b.pool + b.escrowed + b.released + b.refunded, b.opening);
  assert.equal(b.opening, OPENING);
}

/** Independent canonical-JSON implementation, written in the test. */
function testCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) as string;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => testCanonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${testCanonicalJson(record[key])}`).join(",")}}`;
}

test("live funds stay disabled in the simulation", () => {
  assert.equal(LIVE_FUNDS_ENABLED, false);
});

test("1. happy path walks CREATED to FUNDED to RELEASED in order", () => {
  const engine = makeEngine();
  const created = engine.create("evt-create-1", makeRequest());
  assert.equal(created.transition, "create");
  assert.equal(created.fromState, null);
  assert.equal(created.toState, "CREATED");
  assert.equal(created.seq, 1);
  assert.equal(created.prevHash, GENESIS_PREV_HASH);
  assert.equal(created.clock, CLOCK);
  assert.equal(created.amount, AMOUNT.toString());

  const escrowId = created.escrowId;
  assert.equal(engine.getEscrow(escrowId)?.state, "CREATED");

  const funded = engine.fund("evt-fund-1", escrowId);
  assert.equal(funded.transition, "fund");
  assert.equal(funded.fromState, "CREATED");
  assert.equal(funded.toState, "FUNDED");
  assert.equal(funded.seq, 2);
  assert.equal(funded.prevHash, created.hash);
  assert.equal(engine.getEscrow(escrowId)?.state, "FUNDED");
  assert.equal(engine.balances().pool, OPENING - AMOUNT);
  assert.equal(engine.balances().escrowed, AMOUNT);

  const released = engine.release("evt-release-1", escrowId, releaseInput());
  assert.equal(released.transition, "release");
  assert.equal(released.fromState, "FUNDED");
  assert.equal(released.toState, "RELEASED");
  assert.equal(released.seq, 3);
  assert.equal(released.prevHash, funded.hash);
  assert.equal(engine.getEscrow(escrowId)?.state, "RELEASED");
  assert.equal(engine.balances().released, AMOUNT);
  assert.equal(engine.balances().escrowed, 0n);
  assertConserved(engine);
  assert.equal(engine.verifyChain(), true);
  engine.close();
});

test("2. release without a usable authorization receipt throws and changes nothing", () => {
  const engine = makeEngine();
  const created = engine.create("evt-create-1", makeRequest());
  engine.fund("evt-fund-1", created.escrowId);
  const before = engine.balances();
  const receiptCount = engine.receipts().length;

  // Missing receipt object.
  assert.throws(
    () =>
      engine.release("evt-release-1", created.escrowId, {
        authorizationReceipt: undefined as unknown as AuthorizationReceipt,
        completionEvidence: completionEvidence(),
      }),
    InvariantViolation,
  );
  // Blank receipt id.
  assert.throws(
    () =>
      engine.release("evt-release-1", created.escrowId, {
        authorizationReceipt: allowReceipt("   "),
        completionEvidence: completionEvidence(),
      }),
    InvariantViolation,
  );
  // The old untyped string form is malformed now, not an ALLOW receipt.
  assert.throws(
    () =>
      engine.release("evt-release-1", created.escrowId, {
        authorizationReceipt: "allow-receipt-1" as unknown as AuthorizationReceipt,
        completionEvidence: completionEvidence(),
      }),
    InvariantViolation,
  );
  assert.equal(engine.getEscrow(created.escrowId)?.state, "FUNDED");
  assert.deepEqual(engine.balances(), before);
  assert.equal(engine.receipts().length, receiptCount);
  assertConserved(engine);
  engine.close();
});

test("3. release without usable completion evidence throws and changes nothing", () => {
  const engine = makeEngine();
  const created = engine.create("evt-create-1", makeRequest());
  engine.fund("evt-fund-1", created.escrowId);
  const before = engine.balances();
  const receiptCount = engine.receipts().length;

  // Missing evidence object.
  assert.throws(
    () =>
      engine.release("evt-release-1", created.escrowId, {
        authorizationReceipt: allowReceipt(),
        completionEvidence: undefined as unknown as CompletionEvidence,
      }),
    InvariantViolation,
  );
  // Blank evidence reference.
  assert.throws(
    () =>
      engine.release("evt-release-1", created.escrowId, {
        authorizationReceipt: allowReceipt(),
        completionEvidence: completionEvidence("delivery-confirmed", "  "),
      }),
    InvariantViolation,
  );
  // Evidence with no kind at all.
  assert.throws(
    () =>
      engine.release("evt-release-1", created.escrowId, {
        authorizationReceipt: allowReceipt(),
        completionEvidence: {
          kind: undefined as unknown as CompletionEvidenceKind,
          reference: "delivery-proof-1",
        },
      }),
    InvariantViolation,
  );
  assert.equal(engine.getEscrow(created.escrowId)?.state, "FUNDED");
  assert.deepEqual(engine.balances(), before);
  assert.equal(engine.receipts().length, receiptCount);
  assertConserved(engine);
  engine.close();
});

test("4. refund returns funds to the buyer and marks the escrow REFUNDED", () => {
  const engine = makeEngine();
  const created = engine.create("evt-create-1", makeRequest());
  engine.fund("evt-fund-1", created.escrowId);
  const refunded = engine.refund("evt-refund-1", created.escrowId, {
    authorizationReceipt: allowReceipt(),
  });
  assert.equal(refunded.transition, "refund");
  assert.equal(refunded.fromState, "FUNDED");
  assert.equal(refunded.toState, "REFUNDED");
  assert.equal(engine.getEscrow(created.escrowId)?.state, "REFUNDED");
  // The refunded bucket is the record of funds returned to the buyer.
  assert.equal(engine.balances().refunded, AMOUNT);
  assert.equal(engine.balances().escrowed, 0n);
  assertConserved(engine);
  assert.equal(engine.verifyChain(), true);
  engine.close();
});

test("5. double release throws; double refund throws", () => {
  const engine = makeEngine();
  const first = engine.create("evt-create-1", makeRequest());
  engine.fund("evt-fund-1", first.escrowId);
  engine.release("evt-release-1", first.escrowId, {
    authorizationReceipt: allowReceipt(),
    completionEvidence: completionEvidence(),
  });
  assert.throws(
    () =>
      engine.release("evt-release-2", first.escrowId, {
        authorizationReceipt: allowReceipt("allow-receipt-2"),
        completionEvidence: completionEvidence("delivery-confirmed", "delivery-proof-2"),
      }),
    InvariantViolation,
  );

  const second = engine.create("evt-create-2", makeRequest());
  engine.fund("evt-fund-2", second.escrowId);
  engine.refund("evt-refund-1", second.escrowId, {
    authorizationReceipt: allowReceipt(),
  });
  assert.throws(
    () =>
      engine.refund("evt-refund-2", second.escrowId, {
        authorizationReceipt: allowReceipt("allow-receipt-2"),
      }),
    InvariantViolation,
  );
  assertConserved(engine);
  engine.close();
});

test("6. illegal transitions throw InvariantViolation and write nothing", () => {
  const engine = makeEngine();
  const created = engine.create("evt-create-1", makeRequest());
  const escrowId = created.escrowId;

  // Release and dispute from CREATED are illegal.
  assert.throws(
    () =>
      engine.release("evt-release-1", escrowId, {
        authorizationReceipt: allowReceipt(),
        completionEvidence: completionEvidence(),
      }),
    InvariantViolation,
  );
  assert.throws(() => engine.dispute("evt-dispute-1", escrowId), InvariantViolation);
  // Refund from CREATED is illegal.
  assert.throws(
    () =>
      engine.refund("evt-refund-1", escrowId, {
        authorizationReceipt: allowReceipt(),
      }),
    InvariantViolation,
  );
  assert.equal(engine.receipts().length, 1);

  // Double fund is illegal.
  engine.fund("evt-fund-1", escrowId);
  assert.throws(() => engine.fund("evt-fund-2", escrowId), InvariantViolation);
  assert.equal(engine.receipts().length, 2);

  // No transition out of a terminal state.
  engine.release("evt-release-1", escrowId, {
    authorizationReceipt: allowReceipt(),
    completionEvidence: completionEvidence(),
  });
  assert.throws(() => engine.fund("evt-fund-3", escrowId), InvariantViolation);
  assert.throws(() => engine.dispute("evt-dispute-2", escrowId), InvariantViolation);
  assert.throws(
    () =>
      engine.refund("evt-refund-2", escrowId, {
        authorizationReceipt: allowReceipt(),
      }),
    InvariantViolation,
  );
  assert.equal(engine.receipts().length, 3);
  assert.equal(engine.getEscrow(escrowId)?.state, "RELEASED");
  assertConserved(engine);
  engine.close();
});

test("7. replay of the same event id returns the original receipt", () => {
  const engine = makeEngine();
  const created = engine.create("evt-create-1", makeRequest());
  const replayedCreate = engine.create("evt-create-1", makeRequest(99_999n));
  assert.deepEqual(replayedCreate, created);
  assert.equal(engine.receipts().length, 1);

  const funded = engine.fund("evt-fund-1", created.escrowId);
  const replayedFund = engine.fund("evt-fund-1", created.escrowId);
  assert.deepEqual(replayedFund, funded);
  assert.equal(engine.receipts().length, 2);
  assert.equal(engine.balances().escrowed, AMOUNT);
  assert.equal(engine.balances().pool, OPENING - AMOUNT);
  assertConserved(engine);
  engine.close();
});

test("8. dispute path: FUNDED to DISPUTED, then release or refund closes it", () => {
  const engine = makeEngine();

  // Dispute then release with evidence.
  const first = engine.create("evt-create-1", makeRequest());
  engine.fund("evt-fund-1", first.escrowId);
  const disputed = engine.dispute("evt-dispute-1", first.escrowId);
  assert.equal(disputed.fromState, "FUNDED");
  assert.equal(disputed.toState, "DISPUTED");
  assert.equal(engine.getEscrow(first.escrowId)?.state, "DISPUTED");
  assert.equal(engine.balances().escrowed, AMOUNT);
  // No return to FUNDED from DISPUTED.
  assert.throws(() => engine.fund("evt-fund-2", first.escrowId), InvariantViolation);
  const released = engine.release("evt-release-1", first.escrowId, {
    authorizationReceipt: allowReceipt(),
    completionEvidence: completionEvidence(),
  });
  assert.equal(released.fromState, "DISPUTED");
  assert.equal(released.toState, "RELEASED");
  assert.equal(engine.balances().released, AMOUNT);

  // Dispute then refund with authorization.
  const second = engine.create("evt-create-2", makeRequest());
  engine.fund("evt-fund-2", second.escrowId);
  engine.dispute("evt-dispute-2", second.escrowId);
  const refunded = engine.refund("evt-refund-1", second.escrowId, {
    authorizationReceipt: allowReceipt(),
  });
  assert.equal(refunded.fromState, "DISPUTED");
  assert.equal(refunded.toState, "REFUNDED");
  assert.equal(engine.balances().refunded, AMOUNT);
  assertConserved(engine);
  assert.equal(engine.verifyChain(), true);
  engine.close();
});

test("9. conservation invariant holds after every receipt", () => {
  const engine = makeEngine();
  assertConserved(engine);
  const first = engine.create("evt-create-1", makeRequest());
  assertConserved(engine);
  engine.fund("evt-fund-1", first.escrowId);
  assertConserved(engine);
  engine.release("evt-release-1", first.escrowId, {
    authorizationReceipt: allowReceipt(),
    completionEvidence: completionEvidence(),
  });
  assertConserved(engine);
  const second = engine.create("evt-create-2", makeRequest(25_000n));
  assertConserved(engine);
  engine.fund("evt-fund-2", second.escrowId);
  assertConserved(engine);
  engine.dispute("evt-dispute-1", second.escrowId);
  assertConserved(engine);
  engine.refund("evt-refund-1", second.escrowId, {
    authorizationReceipt: allowReceipt(),
  });
  assertConserved(engine);
  const b = engine.balances();
  assert.equal(b.pool, OPENING - AMOUNT - 25_000n);
  assert.equal(b.escrowed, 0n);
  assert.equal(b.released, AMOUNT);
  assert.equal(b.refunded, 25_000n);
  engine.close();
});

test("10. receipt chain verifies under independent hash recomputation", () => {
  const engine = makeEngine();
  const first = engine.create("evt-create-1", makeRequest());
  engine.fund("evt-fund-1", first.escrowId);
  engine.release("evt-release-1", first.escrowId, {
    authorizationReceipt: allowReceipt(),
    completionEvidence: completionEvidence(),
  });
  const receipts = engine.receipts();
  assert.equal(engine.verifyChain(), true);

  // Independent recomputation with the test's own canonical JSON.
  let expectedPrev: string = GENESIS_PREV_HASH;
  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i];
    assert.ok(receipt);
    assert.equal(receipt.seq, i + 1);
    assert.equal(receipt.prevHash, expectedPrev);
    const { hash, ...body } = receipt;
    const recomputed = createHash("sha256")
      .update(testCanonicalJson(body), "utf8")
      .digest("hex");
    assert.equal(recomputed, hash);
    expectedPrev = hash;
  }

  // A tampered amount fails verification.
  const tamperedAmount = JSON.parse(JSON.stringify(receipts)) as EscrowReceipt[];
  const second = tamperedAmount[1];
  assert.ok(second);
  second.amount = "999999";
  assert.equal(verifyReceiptChain(tamperedAmount), false);

  // A tampered hash fails verification.
  const tamperedHash = JSON.parse(JSON.stringify(receipts)) as EscrowReceipt[];
  const firstCopy = tamperedHash[0];
  assert.ok(firstCopy);
  firstCopy.hash = "00".repeat(32);
  assert.equal(verifyReceiptChain(tamperedHash), false);

  // A broken link fails verification.
  const brokenLink = JSON.parse(JSON.stringify(receipts)) as EscrowReceipt[];
  const third = brokenLink[2];
  assert.ok(third);
  third.prevHash = "00".repeat(32);
  assert.equal(verifyReceiptChain(brokenLink), false);
  engine.close();
});

test("11. determinism: the same seeded run twice is byte-identical", () => {
  function runScripted(): string {
    const engine = makeEngine();
    const first = engine.create("evt-create-1", makeRequest());
    engine.fund("evt-fund-1", first.escrowId);
    engine.release("evt-release-1", first.escrowId, {
      authorizationReceipt: allowReceipt(),
      completionEvidence: completionEvidence(),
    });
    const second = engine.create("evt-create-2", makeRequest(25_000n));
    engine.fund("evt-fund-2", second.escrowId);
    engine.dispute("evt-dispute-1", second.escrowId);
    engine.refund("evt-refund-1", second.escrowId, {
      authorizationReceipt: allowReceipt(),
    });
    const output = JSON.stringify(engine.receipts());
    engine.close();
    return output;
  }
  const firstRun = runScripted();
  const secondRun = runScripted();
  assert.equal(secondRun, firstRun);
});

test("12. release with a DENY receipt throws and changes nothing", () => {
  const engine = makeEngine();
  const created = engine.create("evt-create-1", makeRequest());
  engine.fund("evt-fund-1", created.escrowId);
  const before = engine.balances();
  const receiptCount = engine.receipts().length;
  assert.throws(
    () =>
      engine.release("evt-release-1", created.escrowId, {
        authorizationReceipt: denyReceipt(),
        completionEvidence: completionEvidence(),
      }),
    InvariantViolation,
  );
  assert.equal(engine.getEscrow(created.escrowId)?.state, "FUNDED");
  assert.deepEqual(engine.balances(), before);
  assert.equal(engine.receipts().length, receiptCount);
  assertConserved(engine);
  engine.close();
});

test("13. release with an unsupported completion kind throws and changes nothing", () => {
  const engine = makeEngine();
  const created = engine.create("evt-create-1", makeRequest());
  engine.fund("evt-fund-1", created.escrowId);
  const before = engine.balances();
  const receiptCount = engine.receipts().length;
  assert.throws(
    () =>
      engine.release("evt-release-1", created.escrowId, {
        authorizationReceipt: allowReceipt(),
        completionEvidence: {
          kind: "verbal-promise" as unknown as CompletionEvidenceKind,
          reference: "someone-said-so",
        },
      }),
    InvariantViolation,
  );
  assert.equal(engine.getEscrow(created.escrowId)?.state, "FUNDED");
  assert.deepEqual(engine.balances(), before);
  assert.equal(engine.receipts().length, receiptCount);
  assertConserved(engine);
  engine.close();
});

test("14. refund with a DENY receipt throws and changes nothing", () => {
  const engine = makeEngine();
  const created = engine.create("evt-create-1", makeRequest());
  engine.fund("evt-fund-1", created.escrowId);
  const before = engine.balances();
  const receiptCount = engine.receipts().length;
  assert.throws(
    () =>
      engine.refund("evt-refund-1", created.escrowId, {
        authorizationReceipt: denyReceipt(),
      }),
    InvariantViolation,
  );
  assert.equal(engine.getEscrow(created.escrowId)?.state, "FUNDED");
  assert.deepEqual(engine.balances(), before);
  assert.equal(engine.receipts().length, receiptCount);
  assertConserved(engine);
  engine.close();
});

test("15. transition rules are frozen at runtime and cannot be mutated", () => {
  assert.equal(Object.isFrozen(ALLOWED_TRANSITIONS), true);
  for (const transition of [
    "create",
    "fund",
    "release",
    "refund",
    "dispute",
  ] as const) {
    assert.equal(Object.isFrozen(ALLOWED_TRANSITIONS[transition]), true);
    assert.equal(Object.isFrozen(ALLOWED_TRANSITIONS[transition].from), true);
  }
  assert.equal(Object.isFrozen(TERMINAL_STATES), true);
  assert.equal(Object.isFrozen(SUPPORTED_EVIDENCE_KINDS), true);
  assert.deepEqual([...SUPPORTED_EVIDENCE_KINDS], [
    "delivery-confirmed",
    "service-rendered",
    "milestone-reached",
    "inspection-passed",
  ]);
  assert.equal(isSupportedEvidenceKind("delivery-confirmed"), true);
  assert.equal(isSupportedEvidenceKind("verbal-promise"), false);
  assert.equal(isSupportedEvidenceKind(undefined), false);

  // Mutation attempts: they throw in strict mode or fail silently. Either
  // way the table must be byte-for-byte unchanged afterwards.
  const before = JSON.stringify(ALLOWED_TRANSITIONS);
  try {
    (ALLOWED_TRANSITIONS as unknown as Record<string, unknown>).release = {
      from: ["CREATED"],
      to: "RELEASED",
    };
  } catch {
    // Strict-mode refusal.
  }
  try {
    (ALLOWED_TRANSITIONS.release.from as unknown[]).push("CREATED");
  } catch {
    // Strict-mode refusal.
  }
  try {
    (TERMINAL_STATES as unknown[]).push("FUNDED");
  } catch {
    // Strict-mode refusal.
  }
  try {
    (SUPPORTED_EVIDENCE_KINDS as unknown as unknown[]).push("verbal-promise");
  } catch {
    // Strict-mode refusal.
  }
  assert.equal(JSON.stringify(ALLOWED_TRANSITIONS), before);
  assert.equal(isTransitionAllowed("release", "CREATED"), false);
  assert.equal(isTransitionAllowed("release", "FUNDED"), true);
  assert.equal(isTransitionAllowed("release", "DISPUTED"), true);
  assert.equal(isTerminalState("RELEASED"), true);
  assert.equal(isTerminalState("REFUNDED"), true);
  assert.equal(isTerminalState("FUNDED"), false);

  // The engine still enforces the original rules after the attempts.
  const engine = makeEngine();
  const created = engine.create("evt-create-1", makeRequest());
  engine.fund("evt-fund-1", created.escrowId);
  const released = engine.release("evt-release-1", created.escrowId, releaseInput());
  assert.equal(released.toState, "RELEASED");
  engine.close();
});

test("16. the public package surface does not expose the live transition table", () => {
  const exposed = escrowSim as unknown as Record<string, unknown>;
  assert.equal(exposed.ALLOWED_TRANSITIONS, undefined);
  assert.equal(exposed.TERMINAL_STATES, undefined);
  assert.equal(typeof escrowSim.isTransitionAllowed, "function");
  assert.equal(typeof escrowSim.isTerminalState, "function");
  assert.equal(typeof escrowSim.EscrowEngine, "function");
  assert.equal(escrowSim.isTransitionAllowed("release", "FUNDED"), true);
  assert.equal(escrowSim.isTransitionAllowed("release", "CREATED"), false);
  assert.equal(escrowSim.isTerminalState("REFUNDED"), true);
  assert.equal(escrowSim.isTerminalState("FUNDED"), false);
});

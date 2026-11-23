import { authorize, type Deps } from "../payrail54-authorize.ts";
let pass = 0, fail = 0;
const check = (n: string, got: unknown, exp: unknown) => { if (got === exp) { pass++; console.log("PASS ", n); } else { fail++; console.log("FAIL ", n, "expected", exp, "got", got); } };
const NOW = 1_800_000_000_000;
function mk(over: Partial<Deps> = {}) {
  const calls = { authorize: 0, decline: 0, spool: 0, lastDecline: "" };
  const d: Deps = {
    config: { issuerId: "iss1", replayWindowSec: 300, deadlineMs: 200 },
    now: () => NOW,
    verifyIssuerSignature: (_b, _t, s) => s === "good",
    globalKillSwitch: async () => false,
    getCapabilityByToken: async () => ({ ref: "cap1", holofoilCardId: "card1", mandateId: "m1", ownerId: "o1", ownerVersion: 3,
      status: "active", ownerVerified: true, currency: "USD", merchantAllowlist: ["mer1"], approvalAboveCents: 5000, riskBlockThreshold: 0.8 }),
    getMandate: async () => ({ valid: true, ownerId: "o1", expiresAt: NOW + 1e6 }),
    getHolofoilOwnership: async () => ({ ownerId: "o1", version: 3 }),
    findCandidateIntent: async () => ({ id: "i1", signedPayload: {} }),
    findCandidateApproval: async () => null,
    verifyIntentProof: async () => true,
    verifyApprovalProof: async () => true,
    aegisRiskScore: async () => 0.1,
    rpcAuthorize: async () => { calls.authorize++; return { approved: true, reason: "ok", receiptId: "r1" }; },
    rpcRecordDecline: async (a) => { calls.decline++; calls.lastDecline = a.reason; return { approved: false, reason: a.reason, receiptId: "r2" }; },
    spoolDenial: async () => { calls.spool++; },
    ...over,
  };
  return { d, calls };
}
const body = (o: Record<string, unknown> = {}) => JSON.stringify({ issuer_id: "iss1", authorization_id: "auth_1", card_token: "tok_1", amount: 2500, currency: "USD", merchant: { id: "mer1", mcc: "5734" }, ...o });
const hook = (o = {}, sig = "good", ts = String(NOW / 1000)) => ({ rawBody: body(o), signature: sig, timestamp: ts });

{ const { d, calls } = mk(); const r = await authorize(hook(), d); check("happy path approves via atomic RPC", r.approved && calls.authorize === 1, true); }
{ const { d, calls } = mk(); const r = await authorize(hook({}, "bad"), d); check("bad signature declined", r.reason, "bad_signature"); check("unverified payload not written under its auth_id", calls.decline + "/" + calls.spool, "0/1"); }
{ const { d } = mk(); check("stale timestamp", (await authorize(hook({}, "good", String(NOW / 1000 - 301)), d)).reason, "stale_request"); }
{ const { d } = mk(); check("fractional amount rejected", (await authorize(hook({ amount: 25.5 }), d)).reason, "invalid_request"); }
{ const { d } = mk(); check("negative amount rejected", (await authorize(hook({ amount: -1 }), d)).reason, "invalid_request"); }
{ const { d } = mk(); check("bad currency rejected", (await authorize(hook({ currency: "usd" }), d)).reason, "invalid_request"); }
{ const { d } = mk(); check("wrong issuer", (await authorize(hook({ issuer_id: "iss2" }), d)).reason, "wrong_issuer"); }
{ const { d } = mk({ getHolofoilOwnership: async () => ({ ownerId: "o2", version: 4 }) }); check("ownership changed", (await authorize(hook(), d)).reason, "ownership_changed"); }
{ const { d } = mk({ verifyIntentProof: async () => false }); check("bad CIP-54 proof", (await authorize(hook(), d)).reason, "intent_proof_invalid"); }
{ const { d } = mk({ aegisRiskScore: async () => NaN }); check("NaN risk fails closed", (await authorize(hook(), d)).reason, "risk_unavailable"); }
{ const { d } = mk({ aegisRiskScore: async () => 1.5 }); check("out-of-range risk fails closed", (await authorize(hook(), d)).reason, "risk_unavailable"); }
{ const { d } = mk({ aegisRiskScore: async () => 0.9 }); check("high risk blocked", (await authorize(hook(), d)).reason, "risk_block"); }
{ const { d, calls } = mk({ aegisRiskScore: () => new Promise((r) => setTimeout(() => r(0.1), 500)) }); const r = await authorize(hook(), d); check("deadline → durable timeout decline", r.reason + "/" + calls.lastDecline, "timeout/timeout"); }
{ const { d, calls } = mk({ rpcRecordDecline: async () => { throw new Error("db down"); } , globalKillSwitch: async () => true }); const r = await authorize(hook(), d); check("DB down → decline + spool", r.approved + "/" + calls.spool, "false/1"); }
{ const { d } = mk({ rpcAuthorize: async () => ({ approved: false, reason: "daily_limit", receiptId: "r3" }) }); check("DB decision passed through", (await authorize(hook(), d)).reason, "daily_limit"); }
{ const { d } = mk({ rpcRecordDecline: async () => ({ approved: true, reason: "ok", receiptId: "r0" }), findCandidateIntent: async () => null }); check("retry of already-approved auth returns original approval", (await authorize(hook(), d)).approved, true); }
{ const { d } = mk({ getCapabilityByToken: async () => { throw new Error("boom"); } }); check("dependency error fails closed", (await authorize(hook(), d)).reason, "internal_error"); }
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);

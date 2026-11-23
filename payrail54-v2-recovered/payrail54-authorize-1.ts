// PAYRAIL54 v2 — issuer real-time authorization handler
//
// Stateless pre-checks here; every money-touching step commits atomically in Postgres
// (payrail54_authorize.sql → p54_authorize). Approval is returned ONLY after that commit.
// Fail closed: any error, timeout, invalid input or unavailable dependency => DECLINE.
//
// Not atomic across the issuer network: if we commit RESERVED but the issuer never gets
// our answer, the reservation stays RESERVED until the reconciler queries the issuer
// (p54_stale_reservations) and applies the real outcome. Never blind-retry.

export type DeclineReason =
  | "bad_signature" | "stale_request" | "wrong_issuer" | "invalid_request" | "unknown_card"
  | "capability_inactive" | "kill_switch" | "mandate_invalid" | "owner_unverified"
  | "ownership_changed" | "currency_not_allowed" | "merchant_not_allowed" | "no_matching_intent"
  | "intent_proof_invalid" | "approval_proof_invalid" | "risk_block" | "risk_unavailable"
  | "timeout" | "internal_error"
  // returned by p54_authorize:
  | "per_txn_limit" | "daily_limit" | "intent_already_used" | "intent_expired"
  | "approval_required" | "approval_mismatch" | "approval_already_used" | "approval_expired"
  | "invalid_amount";

export interface Decision { approved: boolean; reason: DeclineReason | "ok"; receiptId: string | null }

export interface IssuerWebhook {
  rawBody: string;          // exact bytes as received
  signature: string;        // issuer signature header
  timestamp: string;        // issuer timestamp header (unix seconds)
}

interface AuthRequest {
  issuerId: string; authId: string; cardToken: string;
  amountCents: number; currency: string; merchantId: string; mcc: string;
}

interface Capability {
  ref: string; holofoilCardId: string; mandateId: string; ownerId: string; ownerVersion: number;
  status: "inactive" | "active" | "suspended" | "revoked"; ownerVerified: boolean;
  currency: string; merchantAllowlist: string[]; approvalAboveCents: number; riskBlockThreshold: number;
}

interface Intent { id: string; signedPayload: unknown }
interface Approval { id: string; signedPayload: unknown }

export interface Deps {
  config: { issuerId: string; replayWindowSec: number; deadlineMs: number };
  now(): number; // ms
  // Issuer
  verifyIssuerSignature(rawBody: string, timestamp: string, signature: string): boolean; // HMAC over `${timestamp}.${rawBody}`
  // Reads (no money effects)
  globalKillSwitch(): Promise<boolean>;
  getCapabilityByToken(token: string): Promise<Capability | null>;
  getMandate(id: string): Promise<{ valid: boolean; ownerId: string; expiresAt: number } | null>; // ENTITY54
  getHolofoilOwnership(cardId: string): Promise<{ ownerId: string; version: number } | null>;
  findCandidateIntent(capRef: string, merchantId: string, currency: string, amountCents: number): Promise<Intent | null>;
  findCandidateApproval(intentId: string): Promise<Approval | null>;
  // CIP-54 — verify signature, signer ∈ mandate, action, scope, expiry, nonce against the payload
  verifyIntentProof(payload: unknown, expect: ProofExpectation): Promise<boolean>;
  verifyApprovalProof(payload: unknown, expect: ProofExpectation & { intentId: string }): Promise<boolean>;
  aegisRiskScore(req: AuthRequest, cap: Capability): Promise<number>;
  // Atomic commits (Postgres RPCs)
  rpcAuthorize(a: {
    authId: string; capRef: string; intentId: string; approvalId: string | null;
    amountCents: number; currency: string; merchantId: string; mandateId: string; ownerVersion: number;
  }): Promise<{ approved: boolean; reason: string; receiptId: string }>;
  rpcRecordDecline(a: {
    authId: string; capRef: string | null; amountCents: number; currency: string;
    merchantId: string; reason: DeclineReason;
  }): Promise<{ approved: boolean; reason: string; receiptId: string }>;
  // Last-resort denial evidence when the DB is unreachable (e.g. Cloudflare Queue / R2 spool).
  // The reconciler also backfills from the issuer's own authorization records.
  spoolDenial(record: Record<string, unknown>): Promise<void>;
}

interface ProofExpectation {
  action: "card.purchase" | "card.purchase.approve";
  capRef: string; mandateId: string; merchantId: string; currency: string; amountCents: number;
}

// ---------------------------------------------------------------------------

const MAX_AMOUNT_CENTS = 10_000_000; // sanity ceiling, far above any policy limit
const ID_RE = /^[A-Za-z0-9_\-:.]{1,128}$/;

function parseAndValidate(raw: string): AuthRequest | null {
  let b: any;
  try { b = JSON.parse(raw); } catch { return null; }
  const r: AuthRequest = {
    issuerId: b?.issuer_id, authId: b?.authorization_id, cardToken: b?.card_token,
    amountCents: b?.amount, currency: b?.currency, merchantId: b?.merchant?.id, mcc: b?.merchant?.mcc,
  };
  const ok =
    [r.issuerId, r.authId, r.cardToken, r.merchantId].every((s) => typeof s === "string" && ID_RE.test(s)) &&
    Number.isSafeInteger(r.amountCents) && r.amountCents > 0 && r.amountCents <= MAX_AMOUNT_CENTS &&
    typeof r.currency === "string" && /^[A-Z]{3}$/.test(r.currency) &&
    typeof r.mcc === "string" && /^\d{4}$/.test(r.mcc);
  return ok ? r : null;
}

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("deadline")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function authorize(hook: IssuerWebhook, d: Deps): Promise<Decision> {
  // Set only after signature + validation pass, so timeouts/errors are recorded under a
  // verified auth_id — or spooled as untrusted if we never got that far.
  let verified: AuthRequest | null = null;
  try {
    return await withDeadline(run(hook, d, (r) => (verified = r)), d.config.deadlineMs);
  } catch (e) {
    const reason: DeclineReason = (e as Error)?.message === "deadline" ? "timeout" : "internal_error";
    // If the commit raced the deadline and landed RESERVED, the reconciler resolves it via the issuer.
    const v: AuthRequest | null = verified;
    return recordDecline(d, v ?? {}, null, reason, v === null);
  }
}

async function run(hook: IssuerWebhook, d: Deps, track: (r: AuthRequest) => void): Promise<Decision> {
  // 1. Authenticity: signature over timestamp+body, replay window, issuer identity
  if (!d.verifyIssuerSignature(hook.rawBody, hook.timestamp, hook.signature))
    return recordDecline(d, {}, null, "bad_signature", /*untrusted*/ true);
  const ts = Number(hook.timestamp);
  if (!Number.isFinite(ts) || Math.abs(d.now() / 1000 - ts) > d.config.replayWindowSec)
    return recordDecline(d, {}, null, "stale_request", true);

  // 2. Fields come ONLY from the verified body
  const req = parseAndValidate(hook.rawBody);
  if (!req) return recordDecline(d, {}, null, "invalid_request", true);
  track(req);
  if (req.issuerId !== d.config.issuerId) return recordDecline(d, req, null, "wrong_issuer");

  // 3. Capability + kill switch
  if (await d.globalKillSwitch()) return recordDecline(d, req, null, "kill_switch");
  const cap = await d.getCapabilityByToken(req.cardToken);
  if (!cap) return recordDecline(d, req, null, "unknown_card");
  if (cap.status !== "active") return recordDecline(d, req, cap.ref, "capability_inactive");
  if (!cap.ownerVerified) return recordDecline(d, req, cap.ref, "owner_unverified");

  // 4. Binding: ENTITY54 mandate + HOLOFOIL ownership (version re-checked inside the commit)
  const mandate = await d.getMandate(cap.mandateId);
  if (!mandate || !mandate.valid || mandate.expiresAt <= d.now() || mandate.ownerId !== cap.ownerId)
    return recordDecline(d, req, cap.ref, "mandate_invalid");
  const own = await d.getHolofoilOwnership(cap.holofoilCardId);
  if (!own || own.ownerId !== cap.ownerId || own.version !== cap.ownerVersion)
    return recordDecline(d, req, cap.ref, "ownership_changed");

  // 5. Merchant scope
  if (req.currency !== cap.currency) return recordDecline(d, req, cap.ref, "currency_not_allowed");
  if (!cap.merchantAllowlist.includes(req.merchantId) && !cap.merchantAllowlist.includes(`mcc:${req.mcc}`))
    return recordDecline(d, req, cap.ref, "merchant_not_allowed");

  // 6. CIP-54 intent — verify the cryptographic proof itself, not a stored flag
  const expect: ProofExpectation = {
    action: "card.purchase", capRef: cap.ref, mandateId: cap.mandateId,
    merchantId: req.merchantId, currency: req.currency, amountCents: req.amountCents,
  };
  const intent = await d.findCandidateIntent(cap.ref, req.merchantId, req.currency, req.amountCents);
  if (!intent) return recordDecline(d, req, cap.ref, "no_matching_intent");
  if (!(await d.verifyIntentProof(intent.signedPayload, expect)))
    return recordDecline(d, req, cap.ref, "intent_proof_invalid");

  // 7. Human approval proof (bound to this intent); the commit re-checks binding + single use
  let approvalId: string | null = null;
  if (req.amountCents > cap.approvalAboveCents) {
    const ap = await d.findCandidateApproval(intent.id);
    if (ap) {
      const ok = await d.verifyApprovalProof(ap.signedPayload, { ...expect, action: "card.purchase.approve", intentId: intent.id });
      if (!ok) return recordDecline(d, req, cap.ref, "approval_proof_invalid");
      approvalId = ap.id;
    } // no approval → p54_authorize declines with approval_required (durably)
  }

  // 8. AEGIS risk — reject NaN / out-of-range as unavailable, fail closed
  const risk = await d.aegisRiskScore(req, cap);
  if (typeof risk !== "number" || !Number.isFinite(risk) || risk < 0 || risk > 1)
    return recordDecline(d, req, cap.ref, "risk_unavailable");
  if (risk >= cap.riskBlockThreshold) return recordDecline(d, req, cap.ref, "risk_block");

  // 9. Atomic commit: idempotency, ownership/mandate version, limits, intent+approval
  //    consumption, reservation, state and receipt — one transaction.
  const r = await d.rpcAuthorize({
    authId: req.authId, capRef: cap.ref, intentId: intent.id, approvalId,
    amountCents: req.amountCents, currency: req.currency, merchantId: req.merchantId,
    mandateId: cap.mandateId, ownerVersion: own.version,
  });
  return { approved: r.approved === true && r.reason === "ok", reason: r.reason as Decision["reason"], receiptId: r.receiptId };
}

async function recordDecline(
  d: Deps, req: Partial<AuthRequest>, capRef: string | null, reason: DeclineReason, untrusted = false,
): Promise<Decision> {
  const base = {
    authId: req.authId, capRef, amountCents: req.amountCents ?? 0,
    currency: req.currency ?? "XXX", merchantId: req.merchantId ?? "unknown", reason,
  };
  // Unauthenticated payloads are never written under their claimed auth_id
  // (an attacker could pre-claim a real id). They go to the security spool only.
  if (!untrusted && typeof base.authId === "string" && ID_RE.test(base.authId)) {
    try {
      const r = await d.rpcRecordDecline(base as Parameters<Deps["rpcRecordDecline"]>[0]);
      // Replay of an earlier decision on the same auth_id: return the original answer.
      return { approved: r.approved === true && r.reason === "ok", reason: r.reason as Decision["reason"], receiptId: r.receiptId };
    } catch { /* fall through to spool */ }
  }
  try { await d.spoolDenial({ ...base, untrusted, at: d.now() }); }
  catch { console.error(JSON.stringify({ p54: "denial_unrecorded", ...base, untrusted, at: d.now() })); }
  return { approved: false, reason, receiptId: null };
}

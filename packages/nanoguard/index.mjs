// NanoGuard v0.1: synthetic-only, chain-neutral exposure policy.
// Reference kernel. In-memory state is NOT a distributed lock or production ledger.
export class NanoGuard {
  #groups = new Map();
  constructor({ now = () => Date.now() } = {}) { this.now = now; }
  configure(group, { budget, windowMs, maxCount, maxRecipients, dormantMs, allowlist = [] }) {
    if (!group || !Number.isSafeInteger(windowMs) || windowMs <= 0) throw Error("invalid group/window");
    for (const n of [budget, maxCount, maxRecipients, dormantMs]) if (!Number.isSafeInteger(n) || n < 0) throw Error("invalid policy");
    this.#groups.set(group, { policy: { budget: BigInt(budget), windowMs, maxCount, maxRecipients, dormantMs, allowlist: new Set(allowlist) }, entries: [], reservations: new Map(), lastUserActivity: new Map(), frozen: false });
  }
  userActivity(group, wallet, timestamp = this.now()) {
    const s = this.#state(group); if (!wallet || !Number.isSafeInteger(timestamp) || timestamp > this.now()) throw Error("invalid user activity");
    s.lastUserActivity.set(wallet, timestamp); // Caller MUST authenticate user outside this reference kernel.
  }
  #state(group) { const s = this.#groups.get(group); if (!s) throw Error("unknown group"); return s; }
  reserve(request) {
    const { group, id, wallet, recipient, chain, asset, value, maxFee, mandateValid, payloadMatches } = request;
    const s = this.#state(group), now = this.now(), p = s.policy;
    if (!id || !wallet || !recipient || !chain || !asset || !Number.isSafeInteger(now)) return { status: "DENY", reason: "INVALID_REQUEST" };
    if (typeof value !== "bigint" || typeof maxFee !== "bigint" || value < 0n || maxFee < 0n) return { status: "DENY", reason: "INVALID_UNITS" };
    if (s.reservations.has(id) || s.entries.some(e => e.id === id)) return { status: "DENY", reason: "REPLAY" };
    if (s.frozen) return { status: "DENY", reason: "FROZEN" };
    if (mandateValid !== true || payloadMatches !== true) return { status: "DENY", reason: "MANDATE" };
    const last = s.lastUserActivity.get(wallet);
    if (last === undefined || now - last >= p.dormantMs) return { status: "DENY", reason: "DORMANT" };
    if (!p.allowlist.has(recipient)) return { status: "HOLD", reason: "NEW_RECIPIENT" };
    // Values must already be converted to the SAME conservative integer budget unit.
    // Reservations stay charged until explicit finality or verified non-inclusion.
    const active = s.entries.filter(e => e.time > now - p.windowMs);
    const pending = [...s.reservations.values()];
    const used = active.reduce((a,e) => a + e.cost, 0n) + pending.reduce((a,e) => a + e.cost, 0n);
    const cost = value + maxFee;
    if (used + cost > p.budget) { s.frozen = true; return { status: "DENY", reason: "AGGREGATE_BUDGET" }; }
    if (active.length + pending.length + 1 > p.maxCount) return { status: "DENY", reason: "VELOCITY" };
    const recipients = new Set([...active, ...pending].map(e => e.recipient)); recipients.add(recipient);
    if (recipients.size > p.maxRecipients) return { status: "DENY", reason: "RECIPIENT_COUNT" };
    s.reservations.set(id, { id, wallet, recipient, chain, asset, cost, maxFee, time: now });
    return { status: "RESERVED", id, charged: cost.toString() };
  }
  settle(group, id, { status, actualValue = 0n, actualFee = 0n, provenNonInclusion = false } = {}) {
    const s = this.#state(group), r = s.reservations.get(id);
    if (!r) throw Error("unknown reservation");
    if (typeof actualValue !== "bigint" || typeof actualFee !== "bigint" || actualValue < 0n || actualFee < 0n) throw Error("invalid settlement");
    if (status === "EXPIRED" && !provenNonInclusion) return { status: "PENDING_FINALITY" };
    if (!["FINALIZED", "FAILED", "EXPIRED"].includes(status)) throw Error("invalid finality");
    if (status === "FINALIZED" && actualValue + actualFee > r.cost) { s.frozen = true; return { status: "EXPOSURE_OVERRUN" }; }
    if (status === "FAILED" && actualFee > r.maxFee) { s.frozen = true; return { status: "FEE_OVERRUN" }; }
    const cost = status === "FINALIZED" ? actualValue + actualFee : status === "FAILED" ? actualFee : 0n;
    s.reservations.delete(id);
    s.entries.push({ id, recipient: r.recipient, cost, time: this.now() });
    return { status: "ACCOUNTED", cost: cost.toString() };
  }
  snapshot(group) {
    const s = this.#state(group), now = this.now();
    const spent = s.entries.filter(e => e.time > now - s.policy.windowMs).reduce((a,e) => a + e.cost, 0n);
    const reserved = [...s.reservations.values()].reduce((a,e) => a + e.cost, 0n);
    return { spent: spent.toString(), reserved: reserved.toString(), frozen: s.frozen, pending: s.reservations.size };
  }
}

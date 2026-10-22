/** Zero-spend reference simulator. NOT a Yellow SDK integration. */
export type Transfer = Readonly<{ id: string; from: string; to: string; cents: bigint }>;
export type SettlementReceipt = Readonly<{ mode: "SIMULATION_ONLY"; transferIds: readonly string[]; netByAccount: Readonly<Record<string,string>>; balanced: true }>;
/** Integer cents avoid floating-point settlement drift. Reject malformed and replayed transfers. */
export function simulateNetting(transfers: readonly Transfer[]): SettlementReceipt {
  const ids = new Set<string>();
  const balances = new Map<string,bigint>();
  for (const t of transfers) {
    if (!t.id || !t.from || !t.to || t.from === t.to || typeof t.cents !== "bigint" || t.cents <= 0n) throw new Error("INVALID_TRANSFER");
    if (ids.has(t.id)) throw new Error("REPLAYED_TRANSFER");
    ids.add(t.id);
    balances.set(t.from,(balances.get(t.from) ?? 0n)-t.cents);
    balances.set(t.to,(balances.get(t.to) ?? 0n)+t.cents);
  }
  if ([...balances.values()].reduce((a,b)=>a+b,0n) !== 0n) throw new Error("UNBALANCED");
  return Object.freeze({
    mode: "SIMULATION_ONLY" as const,
    transferIds: Object.freeze([...ids].sort()),
    netByAccount: Object.freeze(Object.fromEntries([...balances.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,v.toString()]))),
    balanced: true as const
  });
}
/** Hard stop: no signing, network, custody, or settlement capability exists in this module. */
export function executeSettlement(): never { throw new Error("LIVE_SETTLEMENT_DISABLED"); }

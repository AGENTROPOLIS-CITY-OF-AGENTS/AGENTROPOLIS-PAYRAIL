import { MockSettlementEngine, type Trade } from "../engine.js";
import { buildReceipt, verifyReceipt } from "../receipt.js";
import { SCENARIOS } from "../scenarios.js";
import { LIVE_FUNDS_ENABLED, MOCK_BANNER, SUCCESS_PATH, TERMINAL_STATES, type SettlementState } from "../states.js";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderStepper(trade: Trade | null): void {
  const root = $("stepper");
  root.replaceChildren();
  const visited = new Set<SettlementState>(trade ? trade.events.map((e) => e.to) : []);
  for (const s of SUCCESS_PATH) {
    const cls = trade && trade.state === s ? "step current" : visited.has(s) ? "step done" : "step";
    root.append(el("li", cls, s));
  }
  const term = $("terminal");
  term.replaceChildren();
  for (const s of TERMINAL_STATES) {
    const cls = trade && trade.state === s ? "chip current" : visited.has(s) ? "chip done" : "chip";
    term.append(el("span", cls, s));
  }
}

function renderEvents(trade: Trade | null): void {
  const root = $("events");
  root.replaceChildren();
  if (!trade) return;
  for (const ev of trade.events) {
    const row = el("li");
    row.append(el("code", "evid", ev.id), el("span", "evtype", `${ev.from ?? "∅"} → ${ev.to}`), el("span", "evnote", ev.note));
    root.append(row);
  }
}

function renderSummary(trade: Trade | null, engine: MockSettlementEngine): void {
  const root = $("summary");
  root.replaceChildren();
  if (!trade) {
    root.append(el("p", "muted", "Pick a scenario to run the mock settlement engine."));
    return;
  }
  const q = trade.quote;
  const rows: [string, string][] = [
    ["Trade", trade.id],
    ["State", trade.state],
    ["Input rail", `${q.inputRail} · ${q.inputAmount} ${q.inputAsset}`],
    ["$XENTS exact-out", `${q.xentsExactOut} (routed: ${trade.xentsRouted})`],
    ["Seller payout", `${q.sellerUsdcAmount} USDC on Base (reserved: ${trade.reservedUsdc})`],
    ["NFT", `chain ${q.nftChainId} · ${q.nftContract} · #${q.nftTokenId} (stays on native chain, never burned)`],
    ["NFT transfer verified", String(trade.nftTransferVerified)],
    ["USDC payout verified", String(trade.usdcPayoutVerified)],
    ["Mock pool USDC available", String(engine.pool.availableUsdc)],
    ["LIVE_FUNDS_ENABLED", String(LIVE_FUNDS_ENABLED)],
  ];
  const dl = el("dl");
  for (const [k, v] of rows) dl.append(el("dt", undefined, k), el("dd", undefined, v));
  root.append(dl);
}

function renderReceipt(trade: Trade | null): void {
  const root = $("receipt");
  root.replaceChildren();
  if (!trade) return;
  const receipt = buildReceipt(trade);
  root.append(
    el("h3", undefined, `Receipt · ${receipt.signatureLabel}`),
    el("p", "muted", `verifies: ${verifyReceipt(receipt)}`),
    el("pre", undefined, JSON.stringify(receipt, null, 2)),
  );
}

function main(): void {
  if (LIVE_FUNDS_ENABLED !== false) throw new Error("LIVE_FUNDS_ENABLED must be false");
  $("banner").textContent = MOCK_BANNER;
  const engine = new MockSettlementEngine();
  let current: Trade | null = null;

  const render = (): void => {
    renderStepper(current);
    renderSummary(current, engine);
    renderEvents(current);
    renderReceipt(current);
  };

  const bar = $("scenarios");
  for (const sc of SCENARIOS) {
    const btn = el("button", undefined, sc.label) as HTMLButtonElement;
    btn.title = sc.description;
    btn.dataset["scenario"] = sc.id;
    btn.addEventListener("click", () => {
      current = sc.run(engine);
      $("scenario-desc").textContent = `${sc.label}: ${sc.description}`;
      render();
    });
    bar.append(btn);
  }
  render();
}

main();

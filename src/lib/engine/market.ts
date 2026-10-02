import type { GameState, ItemId, MarketState, Side } from "@/types/game";
import { ITEMS, ITEM_IDS_ORDERED, RECIPE_BY_OUTPUT, TUNING } from "./config";
import { expo, gauss, rand } from "./rng";
import { clamp, round2 } from "./util";
import { submitOrder } from "./orderBook";

/** Mid price from the live book, falling back to the last trade. */
export function midPrice(m: MarketState): number {
  const bid = m.book.bids[0];
  const ask = m.book.asks[0];
  if (bid && ask) return round2((bid.price + ask.price) / 2);
  return m.lastPrice;
}

/** Slowly cycling "demand regime" target for an item, including supply-chain cost pull. */
function targetPrice(s: GameState, itemId: ItemId, idx: number): number {
  const def = ITEMS[itemId];
  const m = s.market[itemId];
  const cycle = 1 + 0.12 * Math.sin((s.time / 1000 / (600 + idx * 110)) * 2 * Math.PI + m.phase);
  let target = def.basePrice * cycle;
  const recipe = RECIPE_BY_OUTPUT[itemId];
  if (recipe) {
    // Producers need a margin: pull towards (input cost × 1.25) so planks follow wood, etc.
    const inputCost = recipe.inputs.reduce((sum, i) => sum + s.market[i.itemId].anchor * i.qty, 0) / recipe.output.qty;
    target = target * 0.7 + inputCost * 1.25 * 0.3;
  }
  return target;
}

export function createMarketState(s: GameState, itemId: ItemId): MarketState {
  const def = ITEMS[itemId];
  const anchor = def.basePrice * (0.92 + rand(s) * 0.16);
  // Seed some believable history so charts aren't empty on a fresh game.
  const history = [];
  let p = def.basePrice * (0.9 + rand(s) * 0.2);
  const n = 90;
  for (let i = 0; i < n; i++) {
    p += (def.basePrice - p) * 0.04 + gauss(s) * 0.006 * p;
    history.push({ t: s.time - (n - i) * TUNING.priceSampleMs, price: round2(p) });
  }
  history.push({ t: s.time, price: round2(anchor) });
  return {
    book: { bids: [], asks: [] },
    anchor,
    phase: rand(s) * Math.PI * 2,
    lastPrice: round2(anchor),
    volume: 0,
    history,
    trades: [],
  };
}

function botOrderCount(m: MarketState, side: Side): number {
  const list = side === "buy" ? m.book.bids : m.book.asks;
  let n = 0;
  for (const o of list) if (o.owner === "bot") n++;
  return n;
}

function maintainBots(s: GameState, itemId: ItemId, dt: number, initial: boolean): void {
  const def = ITEMS[itemId];
  const m = s.market[itemId];
  const half = TUNING.botHalfSpread;
  const maxOff = TUNING.botMaxOffset;
  const churnP = 1 - Math.exp(-TUNING.botChurnRate * dt);

  // 1) Pull stale / mispriced / randomly-churned bot orders.
  const keepBid = (o: { owner: string; price: number }) =>
    o.owner !== "bot" ||
    (o.price <= m.anchor * (1 - half * 0.4) && o.price >= m.anchor * (1 - maxOff) && rand(s) >= churnP);
  const keepAsk = (o: { owner: string; price: number }) =>
    o.owner !== "bot" ||
    (o.price >= m.anchor * (1 + half * 0.4) && o.price <= m.anchor * (1 + maxOff) && rand(s) >= churnP);
  m.book.bids = m.book.bids.filter(keepBid);
  m.book.asks = m.book.asks.filter(keepAsk);

  // 2) Top the ladder back up.
  const maxAdd = initial ? TUNING.botOrdersPerSide : Math.max(2, Math.ceil(3 * dt));
  for (const side of ["buy", "sell"] as const) {
    let have = botOrderCount(m, side);
    let added = 0;
    while (have < TUNING.botOrdersPerSide && added < maxAdd) {
      const offset = Math.min(maxOff, half + expo(s, 0.02));
      const price = Math.max(0.01, round2(m.anchor * (side === "buy" ? 1 - offset : 1 + offset)));
      const qty = Math.max(1, Math.ceil((2 + rand(s) * 12) * def.depthScale * (1 + offset * 8)));
      submitOrder(s, { itemId, side, kind: "limit", qty, price, owner: "bot" });
      have++;
      added++;
    }
  }
}

function botTakers(s: GameState, itemId: ItemId, dt: number): void {
  const def = ITEMS[itemId];
  const m = s.market[itemId];
  const p = 1 - Math.exp(-TUNING.botTakerRate * dt);
  if (rand(s) >= p) return;
  const base = def.basePrice;
  // Demand pushes back when the price drifts from fair value: cheap → more buyers.
  const buyBias = clamp(0.5 + ((base - m.anchor) / base) * 3, 0.15, 0.85);
  const side: Side = rand(s) < buyBias ? "buy" : "sell";
  const qty = 1 + Math.floor(rand(s) * 3 * def.depthScale);
  const bound = round2(m.anchor * (side === "buy" ? 1.1 : 0.9));
  submitOrder(s, { itemId, side, kind: "market", qty, price: bound, owner: "bot" });
}

/** Fill every book with starting liquidity. */
export function seedMarkets(s: GameState): void {
  for (const itemId of ITEM_IDS_ORDERED) maintainBots(s, itemId, 1, true);
}

/** Advance the simulated "other players" by dtMs. */
export function stepMarket(s: GameState, dtMs: number): void {
  const dt = dtMs / 1000;
  ITEM_IDS_ORDERED.forEach((itemId, idx) => {
    const def = ITEMS[itemId];
    const m = s.market[itemId];

    // Anchor: mean-reverting random walk towards a slowly cycling target.
    const target = targetPrice(s, itemId, idx);
    m.anchor += (target - m.anchor) * (1 - Math.exp(-TUNING.anchorReversion * dt));
    m.anchor += def.volatility * m.anchor * gauss(s) * Math.sqrt(dt);
    m.anchor = Math.max(0.05, m.anchor);

    maintainBots(s, itemId, dt, false);
    botTakers(s, itemId, dt);

    m.volume *= Math.exp(-dt / 60);
    const last = m.history[m.history.length - 1];
    if (!last || s.time - last.t >= TUNING.priceSampleMs) {
      m.history.push({ t: s.time, price: midPrice(m) });
      if (m.history.length > TUNING.priceHistoryKept) m.history.shift();
    }
  });
}

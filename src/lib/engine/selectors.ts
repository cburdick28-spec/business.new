import type { GameState, ItemId, LedgerTotals, Order, RecipeId, Side, Worker } from "@/types/game";
import { ITEMS, ITEM_IDS_ORDERED, RECIPES } from "./config";
import { taskDuration, workerSpeed } from "./production";
import { midPrice } from "./market";
import { money, round2 } from "./util";

/** Read-only derived values. Safe to call from React and from a future server. */

export const mid = (s: GameState, itemId: ItemId): number => midPrice(s.market[itemId]);

export function bestBidAsk(s: GameState, itemId: ItemId): { bid?: number; ask?: number } {
  const { bids, asks } = s.market[itemId].book;
  return { bid: bids[0]?.price, ask: asks[0]?.price };
}

export function playerOrders(s: GameState): Order[] {
  const out: Order[] = [];
  for (const id of ITEM_IDS_ORDERED) {
    for (const o of s.market[id].book.bids) if (o.owner === "player") out.push(o);
    for (const o of s.market[id].book.asks) if (o.owner === "player") out.push(o);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** Cash and goods currently locked in the player's open orders. */
export function escrowValue(s: GameState): number {
  let total = 0;
  for (const o of playerOrders(s)) total += o.side === "buy" ? o.price * o.remaining : mid(s, o.itemId) * o.remaining;
  return money(total);
}

export function inventoryValue(s: GameState): number {
  return money(ITEM_IDS_ORDERED.reduce((sum, id) => sum + s.inventory[id] * mid(s, id), 0));
}

export const netWorth = (s: GameState): number => money(s.balance + inventoryValue(s) + escrowValue(s));

export interface BookLevel {
  price: number;
  qty: number;
  mine: number;
  /** Cumulative quantity from the best price outward. */
  cum: number;
}

/** Aggregate the book by price level (best first). */
export function bookLevels(s: GameState, itemId: ItemId, side: Side, depth = 8): BookLevel[] {
  const list = side === "buy" ? s.market[itemId].book.bids : s.market[itemId].book.asks;
  const levels: BookLevel[] = [];
  for (const o of list) {
    const last = levels[levels.length - 1];
    if (last && last.price === o.price) {
      last.qty += o.remaining;
      if (o.owner === "player") last.mine += o.remaining;
    } else {
      if (levels.length >= depth) break;
      levels.push({ price: o.price, qty: o.remaining, mine: o.owner === "player" ? o.remaining : 0, cum: 0 });
    }
  }
  let cum = 0;
  for (const l of levels) {
    cum += l.qty;
    l.cum = cum;
  }
  return levels;
}

export interface MarketEstimate {
  filled: number;
  avgPrice: number;
  total: number;
  fee: number;
  /** Cash in (sell, net of fee) or cash out (buy). */
  net: number;
}

/** What a market order would do right now, without placing it. */
export function estimateMarket(s: GameState, itemId: ItemId, side: Side, qty: number, feeRate: number): MarketEstimate {
  const list = side === "buy" ? s.market[itemId].book.asks : s.market[itemId].book.bids;
  let left = Math.floor(qty);
  let total = 0;
  let filled = 0;
  for (const o of list) {
    if (left <= 0) break;
    if (o.owner === "player") continue;
    const q = Math.min(left, o.remaining);
    total += q * o.price;
    filled += q;
    left -= q;
  }
  const fee = side === "sell" ? money(total * feeRate) : 0;
  return {
    filled,
    avgPrice: filled ? round2(total / filled) : 0,
    total: money(total),
    fee,
    net: side === "sell" ? money(total - fee) : money(total),
  };
}

export interface PnlRate extends LedgerTotals {
  /**
   * Operating net income per minute: revenue − purchases − wages − fees.
   * One-time hiring/recruiting costs are reported in `hiring` but excluded here,
   * otherwise a single hire would read as a permanent per-minute loss.
   */
  net: number;
  windowMs: number;
}

/** Trailing-window P&L scaled to "per minute". */
export function pnlRate(s: GameState, windowMs = 300_000): PnlRate {
  const from = s.time - windowMs;
  const acc: LedgerTotals = { revenue: 0, purchases: 0, wages: 0, fees: 0, hiring: 0 };
  for (const b of s.ledger.buckets) {
    if (b.t + 5_000 <= from) continue;
    acc.revenue += b.revenue;
    acc.purchases += b.purchases;
    acc.wages += b.wages;
    acc.fees += b.fees;
    acc.hiring += b.hiring;
  }
  // Early in a run the window is shorter than windowMs; a 60s floor keeps the first seconds from spiking.
  const elapsed = Math.max(60_000, Math.min(windowMs, s.time));
  const k = 60_000 / elapsed;
  const net = (acc.revenue - acc.purchases - acc.wages - acc.fees) * k;
  return {
    revenue: acc.revenue * k,
    purchases: acc.purchases * k,
    wages: acc.wages * k,
    fees: acc.fees * k,
    hiring: acc.hiring * k,
    net,
    windowMs: elapsed,
  };
}

export function lifetimeNet(s: GameState): number {
  const t = s.ledger.totals;
  return money(t.revenue - t.purchases - t.wages - t.fees - t.hiring);
}

/** % change of the mid price over the last N history samples. */
export function priceChange(s: GameState, itemId: ItemId, samples = 36): number {
  const h = s.market[itemId].history;
  if (h.length < 2) return 0;
  const ref = h[Math.max(0, h.length - 1 - samples)].price;
  const now = mid(s, itemId);
  return ref > 0 ? (now - ref) / ref : 0;
}

/** Items produced per minute by one worker on their current task. */
export function workerOutputPerMin(w: Worker): number {
  if (!w.task) return 0;
  const qty = w.task.kind === "process" ? RECIPES[w.task.recipeId].output.qty : (ITEMS[w.task.itemId].gather?.yield ?? 1);
  return (60_000 / taskDuration(w.task)) * workerSpeed(w) * qty;
}

/** Output value minus input cost for one run at current mid prices. */
export function recipeMargin(s: GameState, recipeId: RecipeId): { inputCost: number; outputValue: number; margin: number } {
  const r = RECIPES[recipeId];
  const inputCost = r.inputs.reduce((sum, i) => sum + mid(s, i.itemId) * i.qty, 0);
  const outputValue = mid(s, r.output.itemId) * r.output.qty;
  return { inputCost, outputValue, margin: outputValue - inputCost };
}

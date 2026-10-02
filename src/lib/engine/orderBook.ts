import type { GameState, ItemId, Order, OrderKind, OrderOwner, Side } from "@/types/game";
import { ITEMS, TUNING } from "./config";
import { pushLog, record } from "./ledger";
import { clamp, money } from "./util";

export function newId(s: GameState, prefix: string): string {
  return `${prefix}${(s.nextId++).toString(36)}`;
}

/** Insert keeping price-time priority (new orders go behind equal prices). */
function insertSorted(arr: Order[], o: Order, side: Side): void {
  let i = arr.length;
  while (i > 0) {
    const prev = arr[i - 1];
    const prevIsWorse = side === "buy" ? prev.price < o.price : prev.price > o.price;
    if (!prevIsWorse) break;
    i--;
  }
  arr.splice(i, 0, o);
}

export interface SubmitParams {
  itemId: ItemId;
  side: Side;
  kind: OrderKind;
  qty: number;
  /** Limit price, or an optional price-protection bound for market orders. */
  price?: number;
  owner: OrderOwner;
}

export interface SubmitOutcome {
  filled: number;
  /** Gross traded value (price × qty summed over fills). */
  notional: number;
  fees: number;
  resting: Order | null;
  rejected?: string;
}

/** Trades move the hidden anchor price so supply/demand persists beyond the book. */
function applyImpact(s: GameState, itemId: ItemId, aggressor: Side, qty: number): void {
  const def = ITEMS[itemId];
  const m = s.market[itemId];
  const sign = aggressor === "buy" ? 1 : -1;
  const move = clamp((sign * qty) / (def.depthScale * TUNING.impactDivisor), -TUNING.impactCap, TUNING.impactCap);
  m.anchor = Math.max(0.05, m.anchor * (1 + move));
}

function settleFill(
  s: GameState,
  taker: { owner: OrderOwner; side: Side; escrowLimit?: number },
  maker: Order,
  qty: number,
  price: number,
): number {
  const itemId = maker.itemId;
  const value = money(price * qty);
  const buyer = taker.side === "buy" ? taker.owner : maker.owner;
  const seller = taker.side === "sell" ? taker.owner : maker.owner;
  let fee = 0;

  if (buyer === "player") {
    s.inventory[itemId] += qty;
    record(s, "purchases", value);
    if (taker.side === "buy") {
      // Taker pays now: limit buys release their price improvement, market buys pay in full.
      if (taker.escrowLimit !== undefined) s.balance = money(s.balance + (taker.escrowLimit - price) * qty);
      else s.balance = money(s.balance - value);
    }
    // A resting player buy was fully escrowed at its own price (== fill price).
  }
  if (seller === "player") {
    fee = money(value * TUNING.feeRate);
    s.balance = money(s.balance + value - fee);
    record(s, "revenue", value);
    record(s, "fees", fee);
  }

  if (maker.owner === "player") {
    const verb = maker.side === "buy" ? "bought" : "sold";
    pushLog(s, "good", `Limit order filled: ${verb} ${qty} ${ITEMS[itemId].name} @ $${price.toFixed(2)}`);
  }

  const m = s.market[itemId];
  m.lastPrice = price;
  m.volume += qty;
  m.trades.push({ t: s.time, price, qty, side: taker.side });
  if (m.trades.length > TUNING.tradesKept) m.trades.shift();
  applyImpact(s, itemId, taker.side, qty);
  return fee;
}

/**
 * Single entry point for every order (player and bot). Matches against the
 * opposite side with price-time priority; the resting order's price is used.
 *
 * Player orders are escrowed up-front (cash for buys, goods for sells) so the
 * books can never over-commit a balance or an inventory.
 */
export function submitOrder(s: GameState, p: SubmitParams): SubmitOutcome {
  const { itemId, side, kind, owner } = p;
  const qty = Math.floor(p.qty);
  const out: SubmitOutcome = { filled: 0, notional: 0, fees: 0, resting: null };

  if (!(qty >= 1)) return { ...out, rejected: "Quantity must be at least 1." };
  if (kind === "limit" && !(p.price !== undefined && p.price > 0)) {
    return { ...out, rejected: "Enter a valid limit price." };
  }

  const m = s.market[itemId];
  const opposite = side === "buy" ? m.book.asks : m.book.bids;
  const bound = p.price;
  const limitPrice = kind === "limit" ? (p.price as number) : bound;
  let escrowLimit: number | undefined;

  if (owner === "player") {
    // Self-trade prevention: a limit that crosses your own resting order is refused.
    if (kind === "limit") {
      const ownBest = opposite.find((o) => o.owner === "player");
      if (ownBest && (side === "buy" ? ownBest.price <= (limitPrice as number) : ownBest.price >= (limitPrice as number))) {
        return { ...out, rejected: "That price would trade against your own resting order." };
      }
    }
    if (side === "sell") {
      if (s.inventory[itemId] < qty) return { ...out, rejected: `You only have ${s.inventory[itemId]} ${ITEMS[itemId].name}.` };
      s.inventory[itemId] -= qty; // escrow goods
    } else if (kind === "limit") {
      const reserve = money((limitPrice as number) * qty);
      if (s.balance < reserve) return { ...out, rejected: "Not enough cash for that order." };
      if (s.inventory[itemId] + qty > TUNING.inventoryCap) return { ...out, rejected: "Warehouse capacity would be exceeded." };
      s.balance = money(s.balance - reserve); // escrow cash
      escrowLimit = limitPrice;
    }
  }

  let remaining = qty;
  let i = 0;
  while (i < opposite.length && remaining > 0) {
    const maker = opposite[i];
    if (limitPrice !== undefined) {
      if (side === "buy" ? maker.price > limitPrice : maker.price < limitPrice) break;
    }
    if (owner === "player" && maker.owner === "player") {
      i++;
      continue;
    }
    let fillQty = Math.min(remaining, maker.remaining);
    if (owner === "player" && side === "buy" && kind === "market") {
      const room = TUNING.inventoryCap - s.inventory[itemId];
      const affordable = Math.floor(s.balance / maker.price + 1e-9);
      fillQty = Math.min(fillQty, affordable, room);
      if (fillQty <= 0) break;
    }

    const fee = settleFill(s, { owner, side, escrowLimit }, maker, fillQty, maker.price);
    out.filled += fillQty;
    out.notional = money(out.notional + maker.price * fillQty);
    out.fees = money(out.fees + (owner === "player" && side === "sell" ? fee : 0));
    remaining -= fillQty;
    maker.remaining -= fillQty;
    if (maker.remaining <= 0) opposite.splice(i, 1);
    else break; // taker exhausted (or budget-limited): stop here
  }

  if (kind === "limit" && remaining > 0) {
    const order: Order = {
      id: newId(s, "o"),
      itemId,
      side,
      price: limitPrice as number,
      qty,
      remaining,
      owner,
      createdAt: s.time,
    };
    insertSorted(side === "buy" ? m.book.bids : m.book.asks, order, side);
    out.resting = order;
  } else if (owner === "player" && side === "sell" && remaining > 0) {
    s.inventory[itemId] += remaining; // unfilled market-sell goods come back
  }
  return out;
}

/** Cancel a player order and release its escrow. */
export function cancelPlayerOrder(s: GameState, orderId: string): boolean {
  for (const itemId of Object.keys(s.market) as ItemId[]) {
    const { book } = s.market[itemId];
    for (const list of [book.bids, book.asks]) {
      const idx = list.findIndex((o) => o.id === orderId && o.owner === "player");
      if (idx === -1) continue;
      const [o] = list.splice(idx, 1);
      if (o.side === "buy") s.balance = money(s.balance + o.price * o.remaining);
      else s.inventory[o.itemId] += o.remaining;
      return true;
    }
  }
  return false;
}

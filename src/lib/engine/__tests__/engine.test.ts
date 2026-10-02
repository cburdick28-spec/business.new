import { describe, expect, it } from "vitest";
import { actions, advanceInPlace, createInitialState, selectors, simulateOffline } from "@/lib/engine";
import { ITEM_IDS_ORDERED, TUNING } from "@/lib/engine/config";
import type { GameState } from "@/types/game";

const fresh = (seed = 42): GameState => createInitialState(seed);

/** Cash + escrow + goods valued at a fixed price: used to check conservation. */
const totalCash = (s: GameState) => s.balance + selectors.playerOrders(s).filter((o) => o.side === "buy").reduce((a, o) => a + o.price * o.remaining, 0);

describe("market seeding", () => {
  it("starts with two-sided liquidity and a sane spread for every item", () => {
    const s = fresh();
    for (const id of ITEM_IDS_ORDERED) {
      const { bid, ask } = selectors.bestBidAsk(s, id);
      expect(bid).toBeDefined();
      expect(ask).toBeDefined();
      expect(ask!).toBeGreaterThan(bid!);
      expect((ask! - bid!) / ask!).toBeLessThan(0.1);
    }
  });

  it("keeps books uncrossed and sorted after a long simulation", () => {
    const s = fresh();
    advanceInPlace(s, 30 * 60_000);
    for (const id of ITEM_IDS_ORDERED) {
      const { bids, asks } = s.market[id].book;
      for (let i = 1; i < bids.length; i++) expect(bids[i - 1].price).toBeGreaterThanOrEqual(bids[i].price);
      for (let i = 1; i < asks.length; i++) expect(asks[i - 1].price).toBeLessThanOrEqual(asks[i].price);
      if (bids[0] && asks[0]) expect(bids[0].price).toBeLessThan(asks[0].price);
      expect(s.market[id].anchor).toBeGreaterThan(0);
    }
  });
});

describe("order matching", () => {
  it("market-sells goods against bids, paying proceeds minus fee", () => {
    const s = fresh();
    s.inventory.wood = 20;
    const bid = selectors.bestBidAsk(s, "wood").bid!;
    const before = s.balance;
    const r = actions.placeOrder(s, { itemId: "wood", side: "sell", kind: "market", qty: 5 });
    expect(r.ok).toBe(true);
    expect(r.filled).toBe(5);
    expect(s.inventory.wood).toBe(15);
    expect(r.avgPrice).toBeLessThanOrEqual(bid + 0.01);
    expect(s.balance).toBeGreaterThan(before);
    expect(s.ledger.totals.revenue).toBeGreaterThan(0);
    expect(s.ledger.totals.fees).toBeCloseTo(s.ledger.totals.revenue * TUNING.feeRate, 2);
  });

  it("rejects selling goods you don't own and buying beyond your cash", () => {
    const s = fresh();
    expect(actions.placeOrder(s, { itemId: "wood", side: "sell", kind: "market", qty: 1 }).ok).toBe(false);
    s.balance = 1;
    const buy = actions.placeOrder(s, { itemId: "iron_bar", side: "buy", kind: "market", qty: 50 });
    expect(buy.ok).toBe(false);
    expect(s.balance).toBe(1);
  });

  it("market-buys only what the balance can afford", () => {
    const s = fresh();
    s.balance = 30;
    const r = actions.placeOrder(s, { itemId: "planks", side: "buy", kind: "market", qty: 100 });
    expect(r.ok).toBe(true);
    expect(r.filled).toBeGreaterThan(0);
    expect(r.filled).toBeLessThan(100);
    expect(s.balance).toBeGreaterThanOrEqual(0);
    expect(s.inventory.planks).toBe(r.filled);
  });

  it("escrows limit orders and refunds on cancel (cash and goods)", () => {
    const s = fresh();
    s.inventory.planks = 10;
    const cash = s.balance;
    const buy = actions.placeOrder(s, { itemId: "wood", side: "buy", kind: "limit", qty: 10, price: 1 });
    expect(buy.ok && buy.resting).toBe(10);
    expect(s.balance).toBeCloseTo(cash - 10, 2);
    const sell = actions.placeOrder(s, { itemId: "planks", side: "sell", kind: "limit", qty: 10, price: 99 });
    expect(sell.ok).toBe(true);
    expect(s.inventory.planks).toBe(0);
    for (const o of selectors.playerOrders(s)) expect(actions.cancelOrder(s, o.id).ok).toBe(true);
    expect(s.balance).toBeCloseTo(cash, 2);
    expect(s.inventory.planks).toBe(10);
  });

  it("fills a crossing limit buy at the resting price and refunds the improvement", () => {
    const s = fresh();
    const ask = selectors.bestBidAsk(s, "iron_bar").ask!;
    const before = s.balance;
    const r = actions.placeOrder(s, { itemId: "iron_bar", side: "buy", kind: "limit", qty: 1, price: ask + 5 });
    expect(r.filled).toBe(1);
    expect(s.balance).toBeCloseTo(before - ask, 2);
    expect(s.inventory.iron_bar).toBe(1);
  });

  it("fills player resting orders when the market trades through them", () => {
    const s = fresh(7);
    s.inventory.wood = 40;
    const ask = selectors.bestBidAsk(s, "wood").ask!;
    const res = actions.placeOrder(s, { itemId: "wood", side: "sell", kind: "limit", qty: 40, price: round(ask * 0.97) });
    expect(res.ok).toBe(true);
    advanceInPlace(s, 20 * 60_000);
    const stillResting = selectors.playerOrders(s).filter((o) => o.itemId === "wood").reduce((a, o) => a + o.remaining, 0);
    expect(stillResting).toBeLessThan(40);
    expect(s.balance).toBeGreaterThan(TUNING.startBalance - 1);
  });

  it("refuses limits that would trade against your own resting order", () => {
    const s = fresh();
    s.inventory.wood = 5;
    const ask = selectors.bestBidAsk(s, "wood").ask!;
    expect(actions.placeOrder(s, { itemId: "wood", side: "sell", kind: "limit", qty: 5, price: ask + 2 }).ok).toBe(true);
    s.balance = 500;
    expect(actions.placeOrder(s, { itemId: "wood", side: "buy", kind: "limit", qty: 1, price: ask + 3 }).ok).toBe(false);
  });

  it("conserves cash: no balance goes negative or NaN during a trading frenzy", () => {
    const s = fresh(99);
    s.balance = 2000;
    for (let i = 0; i < 200; i++) {
      const id = ITEM_IDS_ORDERED[i % ITEM_IDS_ORDERED.length];
      actions.placeOrder(s, { itemId: id, side: i % 2 ? "buy" : "sell", kind: i % 3 ? "market" : "limit", qty: 1 + (i % 9), price: selectors.mid(s, id) * (0.97 + (i % 7) * 0.01) });
      advanceInPlace(s, 3_000);
    }
    expect(Number.isFinite(s.balance)).toBe(true);
    expect(s.balance).toBeGreaterThanOrEqual(0);
    expect(totalCash(s)).toBeGreaterThanOrEqual(0);
    for (const id of ITEM_IDS_ORDERED) expect(s.inventory[id]).toBeGreaterThanOrEqual(0);
  });
});

const round = (n: number) => Math.round(n * 100) / 100;

describe("price dynamics (supply & demand)", () => {
  it("dumping a large quantity pushes the price down", () => {
    const s = fresh(5);
    s.inventory.planks = 400;
    const before = selectors.mid(s, "planks");
    for (let i = 0; i < 8; i++) actions.placeOrder(s, { itemId: "planks", side: "sell", kind: "market", qty: 50 });
    advanceInPlace(s, 5_000);
    expect(selectors.mid(s, "planks")).toBeLessThan(before * 0.97);
  });
});

describe("production", () => {
  it("hand-gathering respects cooldowns", () => {
    const s = fresh();
    expect(actions.gather(s, "wood").ok).toBe(true);
    expect(actions.gather(s, "wood").ok).toBe(false);
    advanceInPlace(s, 3_500);
    expect(actions.gather(s, "wood").ok).toBe(true);
    expect(s.inventory.wood).toBe(2);
  });

  it("stations convert inputs into outputs over time and stall without inputs", () => {
    const s = fresh();
    s.inventory.wood = 4;
    actions.queueRuns(s, "sawmill", 3);
    advanceInPlace(s, 5_000);
    expect(s.inventory.planks).toBe(1);
    advanceInPlace(s, 5_000);
    expect(s.inventory.planks).toBe(2);
    advanceInPlace(s, 20_000);
    expect(s.inventory.planks).toBe(2); // out of wood
    expect(s.stations.sawmill.queued).toBe(1);
    s.inventory.wood = 2;
    advanceInPlace(s, 5_000);
    expect(s.inventory.planks).toBe(3);
  });
});

describe("workers", () => {
  const hireFirst = (s: GameState) => {
    s.balance = 5000;
    const c = s.candidates[0];
    expect(actions.hireWorker(s, c.id).ok).toBe(true);
    return s.workers[0];
  };

  it("hiring charges the fee, refills applicant slots and records it in the ledger", () => {
    const s = fresh();
    s.balance = 5000;
    const c = s.candidates[0];
    actions.hireWorker(s, c.id);
    expect(s.balance).toBeCloseTo(5000 - c.hireCost, 2);
    expect(s.candidates).toHaveLength(TUNING.candidateSlots);
    expect(s.ledger.totals.hiring).toBe(c.hireCost);
  });

  it("a gathering worker produces continuously and is only paid while working", () => {
    const s = fresh();
    const w = hireFirst(s);
    const cash = s.balance;
    actions.assignWorker(s, w.id, { kind: "gather", itemId: "wood" });
    advanceInPlace(s, 120_000);
    expect(s.inventory.wood).toBeGreaterThan(8);
    expect(s.balance).toBeLessThan(cash);
    expect(s.ledger.totals.wages).toBeCloseTo((w.wagePerMin / 60_000) * 120_000, 1);
  });

  it("a process worker stalls (and stops costing wages) when inputs run out", () => {
    const s = fresh();
    const w = hireFirst(s);
    s.inventory.wood = 2;
    actions.assignWorker(s, w.id, { kind: "process", recipeId: "sawmill" });
    advanceInPlace(s, 30_000);
    expect(s.inventory.planks).toBe(1);
    expect(w.status).toBe("stalled");
    const wages = s.ledger.totals.wages;
    advanceInPlace(s, 60_000);
    expect(s.ledger.totals.wages).toBe(wages);
  });

  it("reassigning mid-cycle returns locked inputs", () => {
    const s = fresh();
    const w = hireFirst(s);
    s.inventory.wood = 2;
    actions.assignWorker(s, w.id, { kind: "process", recipeId: "sawmill" });
    advanceInPlace(s, 1_000);
    expect(s.inventory.wood).toBe(0);
    actions.assignWorker(s, w.id, null);
    expect(s.inventory.wood).toBe(2);
  });

  it("workers stop when they can't be paid", () => {
    const s = fresh();
    const w = hireFirst(s);
    s.balance = 0;
    actions.assignWorker(s, w.id, { kind: "gather", itemId: "wood" });
    advanceInPlace(s, 10_000);
    expect(w.status).toBe("unpaid");
    expect(s.inventory.wood).toBe(0);
  });

  it("workers level up with experience", () => {
    const s = fresh();
    const w = hireFirst(s);
    actions.assignWorker(s, w.id, { kind: "gather", itemId: "wood" });
    s.balance = 100000;
    advanceInPlace(s, 5 * 60_000);
    expect(w.level).toBeGreaterThan(1);
  });
});

describe("a full supply chain", () => {
  it("wood -> planks via workers, sold on the exchange, shows a positive P&L", () => {
    const s = fresh(11);
    s.balance = 2000;
    for (let i = 0; i < 3; i++) actions.hireWorker(s, s.candidates[0].id);
    const [a, b, c] = s.workers;
    actions.assignWorker(s, a.id, { kind: "gather", itemId: "wood" });
    actions.assignWorker(s, b.id, { kind: "gather", itemId: "wood" });
    actions.assignWorker(s, c.id, { kind: "process", recipeId: "sawmill" });
    advanceInPlace(s, 10 * 60_000);
    expect(s.inventory.planks).toBeGreaterThan(5);
    const planks = s.inventory.planks;
    const r = actions.placeOrder(s, { itemId: "planks", side: "sell", kind: "market", qty: planks });
    expect(r.ok).toBe(true);
    expect(selectors.pnlRate(s).revenue).toBeGreaterThan(0);
  });
});

describe("P&L", () => {
  it("one-time hiring costs never show up as a per-minute loss", () => {
    const s = fresh(31);
    s.balance = 5000;
    actions.hireWorker(s, s.candidates[0].id);
    advanceInPlace(s, 15_000);
    const p = selectors.pnlRate(s);
    expect(p.hiring).toBeGreaterThan(0);
    expect(p.net).toBe(0); // nothing operating yet: no wages, sales or purchases
    expect(selectors.lifetimeNet(s)).toBeLessThan(0);
  });

  it("net income per minute reflects operating wages and sales", () => {
    const s = fresh(32);
    s.balance = 5000;
    actions.hireWorker(s, s.candidates[0].id);
    actions.assignWorker(s, s.workers[0].id, { kind: "gather", itemId: "wood" });
    actions.setAutoSell(s, "wood", { enabled: true, keep: 0, minPrice: 0.5 });
    advanceInPlace(s, 5 * 60_000);
    const p = selectors.pnlRate(s);
    expect(p.wages).toBeGreaterThan(0);
    expect(p.revenue).toBeGreaterThan(0);
    expect(p.net).toBeCloseTo(p.revenue - p.purchases - p.wages - p.fees, 6);
  });
});

describe("auto-sell", () => {
  it("sells surplus above the keep level, never below the minimum price", () => {
    const s = fresh(21);
    s.inventory.wood = 100;
    actions.setAutoSell(s, "wood", { enabled: true, keep: 30, minPrice: 0.5 });
    advanceInPlace(s, 10_000);
    expect(s.inventory.wood).toBeLessThanOrEqual(30 + 1);
    expect(s.inventory.wood).toBeGreaterThanOrEqual(30 - 1);
    expect(s.ledger.totals.revenue).toBeGreaterThan(0);

    const t = fresh(22);
    t.inventory.wood = 100;
    actions.setAutoSell(t, "wood", { enabled: true, keep: 0, minPrice: 999 });
    advanceInPlace(t, 10_000);
    expect(t.inventory.wood).toBe(100);
  });
});

describe("persistence + offline", () => {
  it("state survives a JSON round-trip and offline catch-up keeps workers producing", () => {
    const s = fresh(3);
    s.balance = 3000;
    actions.hireWorker(s, s.candidates[0].id);
    actions.assignWorker(s, s.workers[0].id, { kind: "gather", itemId: "iron_ore" });
    const restored = JSON.parse(JSON.stringify(s)) as GameState;
    const { state, report } = simulateOffline(restored, 2 * 60 * 60_000);
    expect(report.simulatedMs).toBe(2 * 60 * 60_000);
    expect(state.inventory.iron_ore).toBeGreaterThan(100);
    expect(report.cashDelta).toBeLessThan(0);
  });

  it("caps offline progress", () => {
    const { report } = simulateOffline(fresh(), 10 * 24 * 60 * 60_000);
    expect(report.simulatedMs).toBe(TUNING.maxOfflineMs);
  });
});

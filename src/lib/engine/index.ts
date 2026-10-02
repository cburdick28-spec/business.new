import type { GameState, ItemId, OfflineReport, RecipeId } from "@/types/game";
import { ITEMS, ITEM_IDS_ORDERED, RECIPES, SAVE_VERSION, TUNING } from "./config";
import { fillCandidates } from "./actions";
import { createMarketState, seedMarkets, stepMarket } from "./market";
import { submitOrder } from "./orderBook";
import { netWorth } from "./selectors";
import { tickStations, tickWorkers } from "./production";

export * from "./config";
export * as actions from "./actions";
export * as selectors from "./selectors";
export { workerSpeed, xpForNextLevel, taskKey, parseTaskKey, taskDuration, taskOutputItem, hasInputs } from "./production";

/** Build a brand-new world. Pass a seed for reproducible tests. */
export function createInitialState(seed: number = Date.now()): GameState {
  const inventory = {} as Record<ItemId, number>;
  const market = {} as GameState["market"];
  const s: GameState = {
    version: SAVE_VERSION,
    time: 0,
    rng: seed >>> 0 || 1,
    nextId: 1,
    balance: TUNING.startBalance,
    inventory,
    market,
    stations: {} as Record<RecipeId, GameState["stations"][RecipeId]>,
    gatherReadyAt: {},
    autoSell: {} as GameState["autoSell"],
    workers: [],
    candidates: [],
    ledger: { buckets: [], totals: { revenue: 0, purchases: 0, wages: 0, fees: 0, hiring: 0 } },
    netWorthHistory: [],
    log: [],
  };
  for (const id of ITEM_IDS_ORDERED) {
    inventory[id] = 0;
    market[id] = createMarketState(s, id);
    s.autoSell[id] = { enabled: false, keep: 0, minPrice: Math.round(ITEMS[id].basePrice * 0.8 * 100) / 100 };
  }
  for (const id of Object.keys(RECIPES) as RecipeId[]) s.stations[id] = { queued: 0, progressMs: 0, running: false };
  seedMarkets(s);
  fillCandidates(s);
  s.netWorthHistory.push({ t: 0, value: netWorth(s) });
  return s;
}

function runAutoSell(s: GameState): void {
  for (const id of ITEM_IDS_ORDERED) {
    const rule = s.autoSell[id];
    if (!rule.enabled) continue;
    const qty = Math.min(TUNING.autoSellMaxPerRun, s.inventory[id] - rule.keep);
    if (qty < 1) continue;
    // A price-bounded market sell: takes bids at or above minPrice, never rests.
    submitOrder(s, { itemId: id, side: "sell", kind: "market", qty, price: rule.minPrice, owner: "player" });
  }
}

function stepOnce(s: GameState, dtMs: number): void {
  const prev = s.time;
  s.time += dtMs;
  if (Math.floor(s.time / TUNING.autoSellEveryMs) !== Math.floor(prev / TUNING.autoSellEveryMs)) runAutoSell(s);
  tickStations(s, dtMs);
  tickWorkers(s, dtMs);
  stepMarket(s, dtMs);

  const last = s.netWorthHistory[s.netWorthHistory.length - 1];
  if (!last || s.time - last.t >= TUNING.netWorthSampleMs) {
    s.netWorthHistory.push({ t: s.time, value: netWorth(s) });
    if (s.netWorthHistory.length > TUNING.netWorthKept) s.netWorthHistory.shift();
  }
}

/**
 * Advance the simulation in place. Long gaps (background tab, offline) are
 * simulated in coarser steps so catching up stays cheap.
 */
export function advanceInPlace(s: GameState, dtMs: number): void {
  if (dtMs <= 0) return;
  const step = dtMs > 30_000 ? 5_000 : TUNING.tickMs;
  let left = dtMs;
  while (left > 1e-6) {
    const d = Math.min(step, left);
    stepOnce(s, d);
    left -= d;
  }
}

export function advance(state: GameState, dtMs: number): GameState {
  const s = structuredClone(state);
  advanceInPlace(s, dtMs);
  return s;
}

/** Catch a loaded save up to "now" and summarise what happened while away. */
export function simulateOffline(state: GameState, elapsedMs: number): { state: GameState; report: OfflineReport } {
  const s = structuredClone(state);
  const simulatedMs = Math.max(0, Math.min(elapsedMs, TUNING.maxOfflineMs));
  const cash0 = s.balance;
  const inv0 = { ...s.inventory };
  advanceInPlace(s, simulatedMs);
  const inventoryDelta: Partial<Record<ItemId, number>> = {};
  for (const id of ITEM_IDS_ORDERED) {
    const d = s.inventory[id] - inv0[id];
    if (d !== 0) inventoryDelta[id] = d;
  }
  return {
    state: s,
    report: { elapsedMs, simulatedMs, cashDelta: s.balance - cash0, inventoryDelta },
  };
}


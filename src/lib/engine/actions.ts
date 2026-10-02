import type {
  ActionResult,
  AutoSellRule,
  GameState,
  ItemId,
  PlaceOrderInput,
  RecipeId,
  Task,
  TradeResult,
  Worker,
  WorkerCandidate,
} from "@/types/game";
import {
  hireCostForStars,
  ITEMS,
  MAX_WORKER_LEVEL,
  RECIPES,
  STAR_WEIGHTS,
  TUNING,
  WORKER_NAMES,
  WORKER_SURNAMES,
  wageForStars,
} from "./config";
import { pushLog, record } from "./ledger";
import { cancelPlayerOrder, newId, submitOrder } from "./orderBook";
import { assignTask, manualGather } from "./production";
import { pickWeighted, randInt } from "./rng";
import { money, round2 } from "./util";

/**
 * Player-facing commands. Each mutates the (already cloned) state it is given
 * and returns a result — the shape a server endpoint would return later.
 */

export function gather(s: GameState, itemId: ItemId): ActionResult {
  return manualGather(s, itemId);
}

export function queueRuns(s: GameState, recipeId: RecipeId, runs: number): ActionResult {
  const st = s.stations[recipeId];
  const n = Math.floor(runs);
  if (!(n >= 1)) return { ok: false, message: "Queue at least one run." };
  st.queued = Math.min(TUNING.maxQueuedRuns, st.queued + n);
  return { ok: true, message: `Queued ${n} × ${RECIPES[recipeId].name}.` };
}

export function clearQueue(s: GameState, recipeId: RecipeId): ActionResult {
  const st = s.stations[recipeId];
  st.queued = st.running ? Math.min(1, st.queued) : 0;
  return { ok: true, message: "Queue cleared." };
}

export function placeOrder(s: GameState, input: PlaceOrderInput): TradeResult {
  const fail = (message: string): TradeResult => ({ ok: false, message, filled: 0, avgPrice: 0, resting: 0 });
  if (!ITEMS[input.itemId]) return fail("Unknown item.");
  if (!Number.isFinite(input.qty) || input.qty < 1) return fail("Enter a quantity of at least 1.");
  const price = input.price === undefined ? undefined : round2(input.price);
  if (input.kind === "limit" && !(price !== undefined && price > 0)) return fail("Enter a valid limit price.");

  const out = submitOrder(s, {
    itemId: input.itemId,
    side: input.side,
    kind: input.kind,
    qty: input.qty,
    price,
    owner: "player",
  });
  if (out.rejected) return fail(out.rejected);

  const name = ITEMS[input.itemId].name;
  const avg = out.filled ? round2(out.notional / out.filled) : 0;
  const resting = out.resting?.remaining ?? 0;
  const verb = input.side === "buy" ? "Bought" : "Sold";

  if (input.kind === "market" && out.filled === 0) {
    return fail(input.side === "buy" ? "Nothing to buy at your budget (or the book is empty)." : "No buyers on the book right now.");
  }
  let message: string;
  if (out.filled > 0 && resting > 0) message = `${verb} ${out.filled} ${name} @ avg $${avg.toFixed(2)}; ${resting} resting at $${price?.toFixed(2)}.`;
  else if (out.filled > 0) message = `${verb} ${out.filled} ${name} @ avg $${avg.toFixed(2)}.`;
  else message = `Limit ${input.side} order placed: ${resting} ${name} @ $${price?.toFixed(2)}.`;
  if (out.filled > 0) pushLog(s, "info", message);

  return { ok: true, message, filled: out.filled, avgPrice: avg, resting, orderId: out.resting?.id };
}

export function cancelOrder(s: GameState, orderId: string): ActionResult {
  return cancelPlayerOrder(s, orderId)
    ? { ok: true, message: "Order cancelled — escrow returned." }
    : { ok: false, message: "Order not found (it may have just filled)." };
}

/* ------------------------------ staffing ------------------------------ */

export function rollCandidate(s: GameState): WorkerCandidate {
  const stars = pickWeighted(s, STAR_WEIGHTS);
  const name = `${WORKER_NAMES[randInt(s, 0, WORKER_NAMES.length - 1)]} ${WORKER_SURNAMES[randInt(s, 0, WORKER_SURNAMES.length - 1)]}`;
  return { id: newId(s, "c"), name, stars, wagePerMin: wageForStars(stars), hireCost: hireCostForStars(stars) };
}

export function fillCandidates(s: GameState): void {
  while (s.candidates.length < TUNING.candidateSlots) s.candidates.push(rollCandidate(s));
}

export function refreshCandidates(s: GameState): ActionResult {
  if (s.balance < TUNING.candidateRefreshCost) return { ok: false, message: "Not enough cash to advertise the roles." };
  s.balance = money(s.balance - TUNING.candidateRefreshCost);
  record(s, "hiring", TUNING.candidateRefreshCost);
  s.candidates = [];
  fillCandidates(s);
  return { ok: true, message: "New applicants are in." };
}

export function hireWorker(s: GameState, candidateId: string): ActionResult {
  const idx = s.candidates.findIndex((c) => c.id === candidateId);
  if (idx === -1) return { ok: false, message: "That applicant is no longer available." };
  const c = s.candidates[idx];
  if (s.workers.length >= TUNING.maxWorkers) return { ok: false, message: `You can employ at most ${TUNING.maxWorkers} workers.` };
  if (s.balance < c.hireCost) return { ok: false, message: "Not enough cash for the hiring fee." };

  s.balance = money(s.balance - c.hireCost);
  record(s, "hiring", c.hireCost);
  const worker: Worker = {
    id: newId(s, "w"),
    name: c.name,
    stars: c.stars,
    level: 1,
    xp: 0,
    wagePerMin: c.wagePerMin,
    task: null,
    progressMs: 0,
    cycleActive: false,
    status: "idle",
    produced: 0,
    earnedWages: 0,
    hiredAt: s.time,
  };
  s.workers.push(worker);
  s.candidates.splice(idx, 1);
  fillCandidates(s);
  pushLog(s, "good", `Hired ${c.name} (${c.stars}★).`);
  return { ok: true, message: `${c.name} joined your company.` };
}

export function fireWorker(s: GameState, workerId: string): ActionResult {
  const idx = s.workers.findIndex((w) => w.id === workerId);
  if (idx === -1) return { ok: false, message: "Worker not found." };
  const w = s.workers[idx];
  assignTask(s, w, null); // returns any locked inputs
  s.workers.splice(idx, 1);
  pushLog(s, "bad", `${w.name} was let go.`);
  return { ok: true, message: `${w.name} was let go.` };
}

export function assignWorker(s: GameState, workerId: string, task: Task | null): ActionResult {
  const w = s.workers.find((x) => x.id === workerId);
  if (!w) return { ok: false, message: "Worker not found." };
  assignTask(s, w, task);
  return { ok: true, message: task ? `${w.name} reassigned.` : `${w.name} is now idle.` };
}

export const MAX_LEVEL = MAX_WORKER_LEVEL;

export function setAutoSell(s: GameState, itemId: ItemId, patch: Partial<AutoSellRule>): ActionResult {
  const rule = s.autoSell[itemId];
  if (!rule) return { ok: false, message: "Unknown item." };
  if (patch.enabled !== undefined) rule.enabled = patch.enabled;
  if (patch.keep !== undefined && Number.isFinite(patch.keep)) rule.keep = Math.max(0, Math.floor(patch.keep));
  if (patch.minPrice !== undefined && Number.isFinite(patch.minPrice)) rule.minPrice = Math.max(0.01, round2(patch.minPrice));
  return { ok: true, message: `Auto-sell for ${ITEMS[itemId].name} ${rule.enabled ? "on" : "off"}.` };
}

/* ------------------------------------------------------------------ */
/* Dev cheat codes                                                      */
/* ------------------------------------------------------------------ */

const CHEAT_CODE_INFINITE_MONEY = "123456";
/**
 * A literal `Infinity` doesn't survive `JSON.stringify` (localStorage saves
 * round-trip it as `null`), so "infinite" money is this large finite number.
 */
const CHEAT_INFINITE_MONEY_BALANCE = 999_999_999;

export function applyCheatCode(s: GameState, code: string): ActionResult {
  if (code.trim() !== CHEAT_CODE_INFINITE_MONEY) return { ok: false, message: "Unknown code." };
  s.balance = CHEAT_INFINITE_MONEY_BALANCE;
  pushLog(s, "good", "Cheat code redeemed: infinite money.");
  return { ok: true, message: "Infinite money activated." };
}

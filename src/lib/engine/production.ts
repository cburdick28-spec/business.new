import type { GameState, ItemId, RecipeDef, RecipeId, StationState, Task, Worker } from "@/types/game";
import { ITEMS, LEVEL_SPEED_BONUS, MAX_WORKER_LEVEL, RECIPES, STAR_SPEED, TUNING } from "./config";
import { pushLog, record } from "./ledger";
import { money } from "./util";

export const workerSpeed = (w: Pick<Worker, "stars" | "level">): number =>
  (STAR_SPEED[w.stars] ?? 1) * (1 + LEVEL_SPEED_BONUS * (w.level - 1));

export const xpForNextLevel = (level: number): number => 60 * level;

export function hasInputs(s: GameState, r: RecipeDef): boolean {
  return r.inputs.every((i) => s.inventory[i.itemId] >= i.qty);
}
function consumeInputs(s: GameState, r: RecipeDef): void {
  for (const i of r.inputs) s.inventory[i.itemId] -= i.qty;
}
function refundInputs(s: GameState, r: RecipeDef): void {
  for (const i of r.inputs) s.inventory[i.itemId] += i.qty;
}
const isFull = (s: GameState, itemId: ItemId): boolean => s.inventory[itemId] >= TUNING.inventoryCap;

/* ------------------------------------------------------------------ */
/* Manual gathering + stations (the player's own hands)                */
/* ------------------------------------------------------------------ */

export function manualGather(s: GameState, itemId: ItemId): { ok: boolean; message: string } {
  const def = ITEMS[itemId];
  if (!def.gather) return { ok: false, message: `${def.name} can't be gathered.` };
  if (isFull(s, itemId)) return { ok: false, message: "Warehouse is full for that item." };
  const ready = s.gatherReadyAt[itemId] ?? 0;
  if (s.time < ready) return { ok: false, message: "Still recovering — try again in a moment." };
  s.inventory[itemId] += def.gather.yield;
  s.gatherReadyAt[itemId] = s.time + (TUNING.manualGatherCooldownMs[itemId] ?? 3_000);
  return { ok: true, message: `+${def.gather.yield} ${def.name}` };
}

export function tickStation(s: GameState, recipe: RecipeDef, st: StationState, dtMs: number): void {
  let budget = dtMs;
  let guard = 0;
  while (budget > 0 && guard++ < 50) {
    if (!st.running) {
      if (st.queued <= 0 || !hasInputs(s, recipe) || isFull(s, recipe.output.itemId)) return;
      consumeInputs(s, recipe);
      st.running = true;
    }
    const use = Math.min(budget, recipe.durationMs - st.progressMs);
    st.progressMs += use;
    budget -= use;
    if (st.progressMs >= recipe.durationMs - 1e-6) {
      s.inventory[recipe.output.itemId] += recipe.output.qty;
      st.queued -= 1;
      st.running = false;
      st.progressMs = 0;
    }
  }
}

export function tickStations(s: GameState, dtMs: number): void {
  for (const id of Object.keys(RECIPES) as RecipeId[]) tickStation(s, RECIPES[id], s.stations[id], dtMs);
}

/* ------------------------------------------------------------------ */
/* Workers                                                             */
/* ------------------------------------------------------------------ */

export function taskDuration(task: Task): number {
  return task.kind === "gather" ? (ITEMS[task.itemId].gather?.baseMs ?? 5_000) : RECIPES[task.recipeId].durationMs;
}

export function taskOutputItem(task: Task): ItemId {
  return task.kind === "gather" ? task.itemId : RECIPES[task.recipeId].output.itemId;
}

export const taskKey = (task: Task | null): string =>
  task === null ? "idle" : task.kind === "gather" ? `gather:${task.itemId}` : `process:${task.recipeId}`;

export function parseTaskKey(key: string): Task | null {
  const [kind, id] = key.split(":");
  if (kind === "gather" && id && id in ITEMS && ITEMS[id as ItemId].gather) return { kind: "gather", itemId: id as ItemId };
  if (kind === "process" && id && id in RECIPES) return { kind: "process", recipeId: id as RecipeId };
  return null;
}

export function tickWorker(s: GameState, w: Worker, dtMs: number): void {
  const task = w.task;
  if (!task) {
    w.status = "idle";
    return;
  }
  const duration = taskDuration(task);
  const speed = workerSpeed(w);
  const recipe = task.kind === "process" ? RECIPES[task.recipeId] : null;
  let budget = dtMs;
  let guard = 0;

  while (budget > 0 && guard++ < 50) {
    if (!w.cycleActive) {
      const out = taskOutputItem(task);
      if (isFull(s, out)) {
        w.status = "full";
        return;
      }
      if (recipe) {
        if (!hasInputs(s, recipe)) {
          w.status = "stalled";
          return;
        }
        consumeInputs(s, recipe);
      }
      w.cycleActive = true;
    }

    const need = (duration - w.progressMs) / speed;
    const use = Math.min(budget, need);
    const wage = money((w.wagePerMin / 60_000) * use);
    if (s.balance < wage) {
      w.status = "unpaid";
      return;
    }
    s.balance = money(s.balance - wage);
    record(s, "wages", wage);
    w.earnedWages = money(w.earnedWages + wage);
    w.progressMs += use * speed;
    budget -= use;
    w.status = "working";

    // Workers level up while they work.
    if (w.level < MAX_WORKER_LEVEL) {
      w.xp += use / 1000;
      while (w.level < MAX_WORKER_LEVEL && w.xp >= xpForNextLevel(w.level)) {
        w.xp -= xpForNextLevel(w.level);
        w.level += 1;
        pushLog(s, "info", `${w.name} reached level ${w.level}.`);
      }
    }

    if (w.progressMs >= duration - 1e-6) {
      const qty = recipe ? recipe.output.qty : (ITEMS[(task as { itemId: ItemId }).itemId].gather?.yield ?? 1);
      s.inventory[taskOutputItem(task)] += qty;
      w.produced += qty;
      w.cycleActive = false;
      w.progressMs = 0;
    }
  }
}

export function tickWorkers(s: GameState, dtMs: number): void {
  for (const w of s.workers) tickWorker(s, w, dtMs);
}

/** Switch a worker's job, returning any inputs locked in an unfinished cycle. */
export function assignTask(s: GameState, w: Worker, task: Task | null): void {
  if (w.cycleActive && w.task?.kind === "process") refundInputs(s, RECIPES[w.task.recipeId]);
  w.task = task;
  w.progressMs = 0;
  w.cycleActive = false;
  w.status = task ? "working" : "idle";
}

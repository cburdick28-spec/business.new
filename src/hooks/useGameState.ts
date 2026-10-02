"use client";

import { create } from "zustand";
import type {
  ActionResult,
  AutoSellRule,
  GameState,
  ItemId,
  OfflineReport,
  PlaceOrderInput,
  RecipeId,
  Task,
  TradeResult,
} from "@/types/game";
import { actions, advanceInPlace, createInitialState, simulateOffline, SAVE_VERSION } from "@/lib/engine";
import { getRepository } from "@/lib/persistence";

/**
 * The game store.
 *
 * All rules live in the pure engine (`src/lib/engine`); this store only
 * (1) holds the current `GameState`, (2) runs engine commands against a
 * cloned draft and publishes the result, and (3) tracks UI-only notices.
 *
 * To go multiplayer, replace the bodies of the command methods with server
 * calls (and `tick` with a subscription) — components won't notice.
 */

export interface Notice {
  id: number;
  tone: "good" | "bad" | "info";
  text: string;
}

interface GameStore {
  game: GameState | null;
  hydrated: boolean;
  offlineReport: OfflineReport | null;
  notices: Notice[];

  init: () => Promise<void>;
  tick: (dtMs: number) => void;
  save: () => void;
  reset: () => Promise<void>;

  gather: (itemId: ItemId) => ActionResult;
  queueRuns: (recipeId: RecipeId, runs: number) => ActionResult;
  clearQueue: (recipeId: RecipeId) => ActionResult;
  placeOrder: (input: PlaceOrderInput) => TradeResult;
  cancelOrder: (orderId: string) => ActionResult;
  hireWorker: (candidateId: string) => ActionResult;
  fireWorker: (workerId: string) => ActionResult;
  assignWorker: (workerId: string, task: Task | null) => ActionResult;
  refreshCandidates: () => ActionResult;
  setAutoSell: (itemId: ItemId, patch: Partial<AutoSellRule>) => ActionResult;

  dismissOffline: () => void;
  dismissNotice: (id: number) => void;
}

let noticeSeq = 1;

export const useGameStore = create<GameStore>()((set, get) => {
  /** Run an engine command on a cloned draft, publish it, surface failures as toasts. */
  function run<R extends ActionResult>(fn: (draft: GameState) => R, opts: { toastSuccess?: boolean } = {}): R {
    const current = get().game;
    if (!current) return { ok: false, message: "Game not loaded yet." } as R;
    const draft = structuredClone(current);
    const result = fn(draft);
    const notices = get().notices;
    const wantToast = !result.ok || opts.toastSuccess;
    set({
      game: draft,
      notices: wantToast
        ? [...notices.slice(-3), { id: noticeSeq++, tone: result.ok ? "good" : "bad", text: result.message }]
        : notices,
    });
    return result;
  }

  return {
    game: null,
    hydrated: false,
    offlineReport: null,
    notices: [],

    async init() {
      if (get().hydrated) return;
      const saved = await getRepository().load();
      if (saved) {
        const elapsed = Math.max(0, Date.now() - saved.savedAt);
        const { state, report } = simulateOffline(saved.state, elapsed);
        const meaningful = report.simulatedMs > 60_000 && (Math.abs(report.cashDelta) > 0.5 || Object.keys(report.inventoryDelta).length > 0);
        set({ game: state, hydrated: true, offlineReport: meaningful ? report : null });
      } else {
        set({ game: createInitialState(), hydrated: true, offlineReport: null });
      }
    },

    tick(dtMs) {
      const current = get().game;
      if (!current) return;
      const draft = structuredClone(current);
      advanceInPlace(draft, dtMs);
      set({ game: draft });
    },

    save() {
      const game = get().game;
      if (!game) return;
      void getRepository().save({ version: SAVE_VERSION, savedAt: Date.now(), state: game });
    },

    async reset() {
      await getRepository().clear();
      set({ game: createInitialState(), offlineReport: null, notices: [] });
      get().save();
    },

    gather: (itemId) => run((d) => actions.gather(d, itemId)),
    queueRuns: (recipeId, runs) => run((d) => actions.queueRuns(d, recipeId, runs)),
    clearQueue: (recipeId) => run((d) => actions.clearQueue(d, recipeId)),
    placeOrder: (input) => run((d) => actions.placeOrder(d, input), { toastSuccess: true }),
    cancelOrder: (orderId) => run((d) => actions.cancelOrder(d, orderId), { toastSuccess: true }),
    hireWorker: (id) => run((d) => actions.hireWorker(d, id), { toastSuccess: true }),
    fireWorker: (id) => run((d) => actions.fireWorker(d, id), { toastSuccess: true }),
    assignWorker: (id, task) => run((d) => actions.assignWorker(d, id, task)),
    refreshCandidates: () => run((d) => actions.refreshCandidates(d)),
    setAutoSell: (itemId, patch) => run((d) => actions.setAutoSell(d, itemId, patch)),

    dismissOffline: () => set({ offlineReport: null }),
    dismissNotice: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),
  };
});

/** Convenience: the loaded game state (null until hydrated). */
export const useGame = (): GameState | null => useGameStore((s) => s.game);

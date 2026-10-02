import type { PersistedGame } from "@/types/game";
import { SAVE_VERSION } from "@/lib/engine/config";

/**
 * Storage boundary for the whole game world.
 *
 * Today: localStorage. Later: implement this interface with Supabase/Prisma
 * (e.g. `load` = SELECT state FROM games WHERE user_id = $1) and swap it in
 * `getRepository()` — nothing else in the app needs to change.
 */
export interface GameRepository {
  load(): Promise<PersistedGame | null>;
  save(game: PersistedGame): Promise<void>;
  clear(): Promise<void>;
}

const STORAGE_KEY = "business-new:save:v1";

export class LocalStorageRepository implements GameRepository {
  async load(): Promise<PersistedGame | null> {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedGame;
      if (!parsed || parsed.version !== SAVE_VERSION || !parsed.state || parsed.state.version !== SAVE_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async save(game: PersistedGame): Promise<void> {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    } catch {
      /* quota / private mode — the game keeps running in memory */
    }
  }

  async clear(): Promise<void> {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

let repo: GameRepository | null = null;
export function getRepository(): GameRepository {
  if (!repo) repo = new LocalStorageRepository();
  return repo;
}

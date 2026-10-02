"use client";

import { useEffect } from "react";
import { TUNING } from "@/lib/engine";
import { useGameStore } from "./useGameState";

const AUTOSAVE_MS = 5_000;

/**
 * Boots the store from storage, then drives the simulation with real elapsed
 * time (so throttled background tabs catch up instead of drifting) and
 * autosaves. Mount exactly once, near the root.
 */
export function useGameLoop(): void {
  useEffect(() => {
    const store = useGameStore.getState();
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let saver: ReturnType<typeof setInterval> | undefined;

    void store.init().then(() => {
      if (cancelled) return;
      let last = performance.now();
      timer = setInterval(() => {
        const now = performance.now();
        const dt = now - last;
        last = now;
        useGameStore.getState().tick(Math.min(dt, TUNING.maxOfflineMs));
      }, TUNING.tickMs);
      saver = setInterval(() => useGameStore.getState().save(), AUTOSAVE_MS);
    });

    const flush = () => useGameStore.getState().save();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (saver) clearInterval(saver);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);
}

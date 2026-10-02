"use client";

import { Moon } from "lucide-react";
import { ITEMS } from "@/lib/engine";
import { fmtDuration, fmtNum, fmtSigned, tone } from "@/lib/format";
import { useGameStore } from "@/hooks/useGameState";
import type { ItemId } from "@/types/game";

export function OfflineReportModal() {
  const report = useGameStore((s) => s.offlineReport);
  const dismiss = useGameStore((s) => s.dismissOffline);
  if (!report) return null;
  const items = Object.entries(report.inventoryDelta) as [ItemId, number][];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="offline-title">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/30">
            <Moon className="h-5 w-5 text-indigo-300" aria-hidden />
          </div>
          <div>
            <h2 id="offline-title" className="text-lg font-semibold text-zinc-50">Welcome back</h2>
            <p className="text-sm text-zinc-500">While you were away for {fmtDuration(report.elapsedMs)}{report.simulatedMs < report.elapsedMs ? ` (up to ${fmtDuration(report.simulatedMs)} simulated)` : ""}:</p>
          </div>
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between rounded-lg bg-zinc-800/50 px-3 py-2">
            <span className="text-zinc-400">Cash change</span>
            <span className={`tabular font-mono font-semibold ${tone(report.cashDelta)}`}>{fmtSigned(report.cashDelta)}</span>
          </li>
          {items.map(([id, d]) => (
            <li key={id} className="flex justify-between rounded-lg bg-zinc-800/50 px-3 py-2">
              <span className="text-zinc-400">{ITEMS[id].name}</span>
              <span className={`tabular font-mono font-semibold ${tone(d)}`}>{d > 0 ? "+" : ""}{fmtNum(d)}</span>
            </li>
          ))}
        </ul>
        <button onClick={dismiss} className="mt-5 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400">
          Back to work
        </button>
      </div>
    </div>
  );
}

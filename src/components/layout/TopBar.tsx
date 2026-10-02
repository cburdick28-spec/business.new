"use client";

import { RotateCcw, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useGame, useGameStore } from "@/hooks/useGameState";
import { selectors } from "@/lib/engine";
import { fmtClock, fmtMoney, fmtSigned, tone } from "@/lib/format";

export function TopBar({ title }: { title: string }) {
  const game = useGame();
  const reset = useGameStore((s) => s.reset);
  if (!game) return null;
  const pnl = selectors.pnlRate(game);
  const Trend = pnl.net >= 0 ? TrendingUp : TrendingDown;

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/85 px-4 py-3 backdrop-blur md:px-6">
      <h1 className="text-base font-semibold text-zinc-100 md:text-lg">{title}</h1>
      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-1.5" title="Cash on hand">
          <Wallet className="h-4 w-4 text-emerald-400" aria-hidden />
          <span className="tabular font-mono text-sm font-semibold text-zinc-100">{fmtMoney(game.balance)}</span>
        </div>
        <div className={`hidden items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 sm:flex ${tone(pnl.net)}`} title="Operating net income per minute (trailing 5 min): sales − purchases − wages − fees">
          <Trend className="h-4 w-4" aria-hidden />
          <span className="tabular font-mono text-sm font-semibold">{fmtSigned(pnl.net)}/min</span>
        </div>
        <div className="hidden rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 font-mono text-sm text-zinc-400 lg:block" title="Time played">
          {fmtClock(game.time)}
        </div>
        <button
          onClick={() => {
            if (window.confirm("Start over? This deletes your current company and cannot be undone.")) void reset();
          }}
          className="rounded-lg border border-zinc-800 p-2 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          aria-label="Reset game"
          title="Reset game"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

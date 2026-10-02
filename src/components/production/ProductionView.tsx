"use client";

import { ArrowRight, Hourglass, Trash2 } from "lucide-react";
import { ITEMS, RECIPES, TUNING, selectors, taskKey, workerSpeed } from "@/lib/engine";
import { fmtDuration, fmtNum, fmtSigned, tone } from "@/lib/format";
import { useGame, useGameStore } from "@/hooks/useGameState";
import { ITEM_VISUALS } from "@/components/itemVisuals";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { GameState, RecipeId } from "@/types/game";

export function ProductionView() {
  const game = useGame();
  if (!game) return null;
  return (
    <div className="space-y-4 md:space-y-6">
      <p className="max-w-2xl text-sm text-zinc-400">
        Stations turn cheap raw goods into more valuable ones. Queue runs yourself, or assign workers on the Workforce tab — each worker runs their own line in parallel.
      </p>
      <div className="grid gap-4 xl:grid-cols-3 md:gap-6">
        {(Object.keys(RECIPES) as RecipeId[]).map((id) => (
          <StationCard key={id} id={id} game={game} />
        ))}
      </div>
    </div>
  );
}

function StationCard({ id, game }: { id: RecipeId; game: GameState }) {
  const queueRuns = useGameStore((s) => s.queueRuns);
  const clearQueue = useGameStore((s) => s.clearQueue);
  const r = RECIPES[id];
  const st = game.stations[id];
  const { inputCost, outputValue, margin } = selectors.recipeMargin(game, id);
  const crew = game.workers.filter((w) => taskKey(w.task) === `process:${id}`);
  const crewRunsPerMin = crew.reduce((a, w) => a + (60_000 / r.durationMs) * workerSpeed(w), 0);
  const canRun = r.inputs.every((i) => game.inventory[i.itemId] >= i.qty);
  const maxRuns = Math.min(TUNING.maxQueuedRuns, Math.min(...r.inputs.map((i) => Math.floor(game.inventory[i.itemId] / i.qty))));
  const stalled = !st.running && st.queued > 0 && !canRun;
  const out = ITEM_VISUALS[r.output.itemId];

  return (
    <Card title={r.station} icon={Hourglass} action={<span className="text-xs text-zinc-500">{fmtDuration(r.durationMs)} / run</span>} bodyClassName="space-y-4">
      {/* recipe */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-950/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {r.inputs.map((i) => (
            <ItemChip key={i.itemId} itemId={i.itemId} qty={i.qty} have={game.inventory[i.itemId]} />
          ))}
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
        <ItemChip itemId={r.output.itemId} qty={r.output.qty} have={game.inventory[r.output.itemId]} />
      </div>

      {/* margin */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <Mini label="Input cost" value={`$${inputCost.toFixed(2)}`} />
        <Mini label="Output value" value={`$${outputValue.toFixed(2)}`} />
        <Mini label="Margin / run" value={fmtSigned(margin)} valueClass={tone(margin)} />
      </div>

      {/* progress */}
      <div>
        <div className="mb-1.5 flex justify-between text-xs">
          <span className={st.running ? "text-emerald-400" : stalled ? "text-amber-400" : "text-zinc-500"}>
            {st.running ? "Running" : stalled ? `Waiting for ${r.inputs.map((i) => `${i.qty}× ${ITEMS[i.itemId].name}`).join(", ")}` : st.queued > 0 ? "Starting…" : "Idle"}
          </span>
          <span className="tabular font-mono text-zinc-500">{fmtNum(st.queued)} queued</span>
        </div>
        <ProgressBar value={st.running ? st.progressMs / r.durationMs : 0} barClassName={out.bar} />
      </div>

      {/* queue controls */}
      <div className="flex flex-wrap gap-2">
        {[1, 5, 10].map((n) => (
          <button key={n} onClick={() => queueRuns(id, n)} className="rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700">
            +{n}
          </button>
        ))}
        <button
          onClick={() => queueRuns(id, maxRuns)}
          disabled={maxRuns < 1}
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-300 transition-colors enabled:hover:bg-emerald-500/20 disabled:opacity-40"
        >
          Max ({maxRuns < 1 ? 0 : maxRuns})
        </button>
        <button onClick={() => clearQueue(id)} disabled={st.queued === 0} className="ml-auto rounded-md p-2 text-zinc-500 transition-colors enabled:hover:text-rose-400 disabled:opacity-30" aria-label="Clear queue" title="Clear queue">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-zinc-800 pt-3 text-xs text-zinc-500">
        <span>
          {crew.length} {crew.length === 1 ? "worker" : "workers"} assigned
        </span>
        <span className="tabular font-mono">{crewRunsPerMin.toFixed(1)} runs/min</span>
      </div>
    </Card>
  );
}

function ItemChip({ itemId, qty, have }: { itemId: keyof typeof ITEM_VISUALS; qty: number; have: number }) {
  const v = ITEM_VISUALS[itemId];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-sm ring-1 ${v.bg} ${v.ring}`} title={`${ITEMS[itemId].name} — you have ${have}`}>
      <v.icon className={`h-3.5 w-3.5 ${v.text}`} aria-hidden />
      <span className="tabular font-mono font-medium text-zinc-100">{qty}×</span>
      <span className="text-zinc-300">{ITEMS[itemId].name}</span>
      <span className="tabular font-mono text-[11px] text-zinc-500">({fmtNum(have)})</span>
    </span>
  );
}

function Mini({ label, value, valueClass = "text-zinc-200" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg bg-zinc-950/60 px-2 py-2">
      <div className="text-zinc-500">{label}</div>
      <div className={`tabular mt-0.5 font-mono text-sm ${valueClass}`}>{value}</div>
    </div>
  );
}

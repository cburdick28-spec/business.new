"use client";

import { Hand } from "lucide-react";
import type { ViewId } from "@/components/layout/Nav";
import { ITEMS, TUNING, selectors, taskKey } from "@/lib/engine";
import { fmtMoney, fmtNum, fmtPct, tone } from "@/lib/format";
import { useGame, useGameStore } from "@/hooks/useGameState";
import { ITEM_VISUALS } from "@/components/itemVisuals";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { ItemId } from "@/types/game";

const NODES: ItemId[] = ["wood", "iron_ore"];

export function GatherView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const game = useGame();
  const gather = useGameStore((s) => s.gather);
  if (!game) return null;

  return (
    <div className="space-y-4 md:space-y-6">
      <p className="max-w-2xl text-sm text-zinc-400">
        Raw nodes are where every supply chain starts. Work them by hand to bootstrap, then{" "}
        <button onClick={() => onNavigate("workers")} className="text-emerald-400 hover:underline">assign workers</button> to harvest around the clock.
      </p>
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        {NODES.map((id) => {
          const def = ITEMS[id];
          const v = ITEM_VISUALS[id];
          const cooldown = TUNING.manualGatherCooldownMs[id] ?? 3000;
          const readyAt = game.gatherReadyAt[id] ?? 0;
          const remaining = Math.max(0, readyAt - game.time);
          const ready = remaining <= 0;
          const full = game.inventory[id] >= TUNING.inventoryCap;
          const crew = game.workers.filter((w) => taskKey(w.task) === `gather:${id}`);
          const rate = crew.reduce((a, w) => a + selectors.workerOutputPerMin(w), 0);
          const price = selectors.mid(game, id);
          const chg = selectors.priceChange(game, id);
          const manualPerMin = (60_000 / cooldown) * (def.gather?.yield ?? 1);

          return (
            <Card key={id} className="overflow-hidden" bodyClassName="p-0">
              <div className={`flex items-center gap-4 border-b border-zinc-800 p-5 ${v.bg}`}>
                <span className={`grid h-14 w-14 place-items-center rounded-2xl bg-zinc-950/60 ring-1 ${v.ring}`}>
                  <v.icon className={`h-7 w-7 ${v.text}`} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-zinc-50">{def.name}</h2>
                  <p className="tabular font-mono text-sm text-zinc-400">
                    {fmtMoney(price)} <span className={tone(chg)}>{fmtPct(chg)}</span>
                  </p>
                </div>
                <div className="text-right">
                  <div className="tabular font-mono text-2xl font-semibold text-zinc-50">{fmtNum(game.inventory[id])}</div>
                  <div className="text-xs text-zinc-500">in stock</div>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <button
                  onClick={() => gather(id)}
                  disabled={!ready || full}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-4 text-base font-semibold transition-all enabled:active:scale-[.99] disabled:cursor-not-allowed ${
                    ready && !full ? `${v.bar} text-zinc-950 hover:brightness-110` : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  <Hand className="h-5 w-5" aria-hidden />
                  {full ? "Warehouse full" : ready ? `${def.gather?.verb} ${def.name} (+${def.gather?.yield})` : `Recovering… ${(remaining / 1000).toFixed(1)}s`}
                </button>
                <ProgressBar value={ready ? 1 : 1 - remaining / cooldown} barClassName={v.bar} />

                <dl className="grid grid-cols-3 gap-3 text-center text-xs">
                  <Metric label="By hand" value={`${manualPerMin.toFixed(0)}/min`} />
                  <Metric label={`Crew (${crew.length})`} value={`${rate.toFixed(1)}/min`} />
                  <Metric label="Crew value" value={`${fmtMoney(rate * price)}/min`} />
                </dl>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-950/60 px-2 py-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="tabular mt-0.5 font-mono text-sm text-zinc-200">{value}</dd>
    </div>
  );
}

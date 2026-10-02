"use client";

import { Activity, Boxes, Briefcase, Coins, Factory, Gauge, Receipt, Rocket, Scale, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import type { ViewId } from "@/components/layout/Nav";
import { ITEMS, ITEM_IDS_ORDERED, RECIPES, TUNING, selectors, taskKey } from "@/lib/engine";
import { fmtMoney, fmtMoney0, fmtNum, fmtPct, fmtSigned, tone } from "@/lib/format";
import { useGame } from "@/hooks/useGameState";
import { ITEM_VISUALS } from "@/components/itemVisuals";
import { Card, Stat } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Sparkline } from "@/components/ui/Sparkline";
import type { GameState, RecipeId } from "@/types/game";

export function DashboardView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const game = useGame();
  if (!game) return null;

  const pnl = selectors.pnlRate(game);
  const nw = selectors.netWorth(game);
  const startNw = game.netWorthHistory[0]?.value ?? TUNING.startBalance;
  const working = game.workers.filter((w) => w.status === "working").length;
  const payroll = game.workers.filter((w) => w.status === "working").reduce((a, w) => a + w.wagePerMin, 0);
  const nwSeries = game.netWorthHistory.map((p) => p.value);
  const fresh = game.ledger.totals.revenue === 0 && game.workers.length === 0;

  return (
    <div className="space-y-4 md:space-y-6">
      {fresh && <QuickStart onNavigate={onNavigate} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Cash" icon={Wallet} value={fmtMoney(game.balance)} sub={`${selectors.playerOrders(game).length} open orders`} />
        <Stat label="Net worth" icon={Scale} value={fmtMoney0(nw)} sub={<span className={tone(nw - startNw)}>{fmtSigned(nw - startNw, 0)} since start</span>} />
        <Stat
          label="Net income / min"
          icon={pnl.net >= 0 ? TrendingUp : TrendingDown}
          value={fmtSigned(pnl.net)}
          valueClassName={tone(pnl.net)}
          sub="Operating, trailing 5 min"
        />
        <Stat label="Workforce" icon={Users} value={`${working}/${game.workers.length}`} sub={game.workers.length ? `Payroll ${fmtMoney(payroll)}/min while working` : "No staff hired yet"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 md:gap-6">
        <Card title="Performance" icon={Activity} className="lg:col-span-2" bodyClassName="space-y-5">
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs text-zinc-500">Net worth (cash + stock + open orders)</span>
              <span className="tabular font-mono text-sm text-zinc-300">{fmtMoney(nw)}</span>
            </div>
            <Sparkline values={nwSeries} stroke={nw >= startNw ? "#34d399" : "#fb7185"} height={120} showBaseline />
          </div>
          <PnlBreakdown game={game} />
        </Card>

        <InventoryCard game={game} onNavigate={onNavigate} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 md:gap-6">
        <OperationsCard game={game} onNavigate={onNavigate} />
        <WorkforceCard game={game} onNavigate={onNavigate} />
        <ActivityCard game={game} />
      </div>
    </div>
  );
}

function QuickStart({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const steps: { n: number; text: string; to: ViewId; cta: string }[] = [
    { n: 1, text: "Chop wood and mine ore by hand to get started.", to: "gather", cta: "Gather" },
    { n: 2, text: "Refine them at the sawmill and smelter for a higher price.", to: "production", cta: "Produce" },
    { n: 3, text: "Sell on the exchange — instantly, or with a limit order.", to: "market", cta: "Trade" },
    { n: 4, text: "Hire workers so it all runs while you're away.", to: "workers", cta: "Hire" },
  ];
  return (
    <Card title="Quick start" icon={Rocket} className="border-emerald-500/20 bg-emerald-500/[0.04]">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s) => (
          <button key={s.n} onClick={() => onNavigate(s.to)} className="group flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left transition-colors hover:border-emerald-500/40">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-400">{s.n}</span>
            <span className="text-sm text-zinc-300">
              {s.text} <span className="font-medium text-emerald-400 group-hover:underline">{s.cta} →</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function PnlBreakdown({ game }: { game: GameState }) {
  const p = selectors.pnlRate(game);
  const rows: { label: string; value: number; sign: 1 | -1; bar: string }[] = [
    { label: "Sales revenue", value: p.revenue, sign: 1, bar: "bg-emerald-500" },
    { label: "Market purchases", value: p.purchases, sign: -1, bar: "bg-sky-500" },
    { label: "Wages", value: p.wages, sign: -1, bar: "bg-amber-500" },
    { label: "Exchange fees", value: p.fees, sign: -1, bar: "bg-violet-500" },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));
  const lifetime = selectors.lifetimeNet(game);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Receipt className="h-4 w-4 text-zinc-500" aria-hidden /> Operating P&amp;L · per minute
        </span>
        <span className={`tabular font-mono text-sm font-semibold ${tone(p.net)}`}>{fmtSigned(p.net)}/min</span>
      </div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[110px_1fr_80px] items-center gap-3 text-sm sm:grid-cols-[140px_1fr_90px]">
            <span className="truncate text-zinc-400">{r.label}</span>
            <ProgressBar value={r.value / max} barClassName={r.bar} />
            <span className={`tabular text-right font-mono ${r.value === 0 ? "text-zinc-600" : r.sign > 0 ? "text-emerald-400" : "text-rose-300"}`}>
              {r.value === 0 ? "—" : `${r.sign > 0 ? "+" : "-"}$${r.value.toFixed(2)}`}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3 text-xs text-zinc-500">
        <span>Hiring &amp; recruiting (one-time, lifetime)</span>
        <span className="tabular font-mono text-rose-300">-${game.ledger.totals.hiring.toFixed(2)}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-500">
        <span>Lifetime net income (after hiring)</span>
        <span className={`tabular font-mono ${tone(lifetime)}`}>{fmtSigned(lifetime)}</span>
      </div>
    </div>
  );
}

function InventoryCard({ game, onNavigate }: { game: GameState; onNavigate: (v: ViewId) => void }) {
  const total = selectors.inventoryValue(game);
  return (
    <Card
      title="Inventory"
      icon={Boxes}
      action={<span className="tabular font-mono text-xs text-zinc-400">{fmtMoney0(total)}</span>}
      bodyClassName="p-0"
    >
      <ul className="divide-y divide-zinc-800/70">
        {ITEM_IDS_ORDERED.map((id) => {
          const v = ITEM_VISUALS[id];
          const qty = game.inventory[id];
          const price = selectors.mid(game, id);
          const chg = selectors.priceChange(game, id);
          const auto = game.autoSell[id].enabled;
          return (
            <li key={id}>
              <button onClick={() => onNavigate("market")} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-zinc-800/40">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ${v.bg} ${v.ring}`}>
                  <v.icon className={`h-4 w-4 ${v.text}`} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm text-zinc-200">
                    {ITEMS[id].name}
                    {auto && <span className="rounded bg-emerald-500/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-400">auto-sell</span>}
                  </span>
                  <span className="tabular block font-mono text-[11px] text-zinc-500">
                    ${price.toFixed(2)} <span className={tone(chg)}>{fmtPct(chg)}</span>
                  </span>
                </span>
                <span className="text-right">
                  <span className="tabular block font-mono text-sm text-zinc-100">{fmtNum(qty)}</span>
                  <span className="tabular block font-mono text-[11px] text-zinc-500">{fmtMoney0(qty * price)}</span>
                </span>
              </button>
              <div className="px-4 pb-2">
                <ProgressBar value={qty / TUNING.inventoryCap} barClassName={qty >= TUNING.inventoryCap ? "bg-rose-500" : v.bar} className="h-1" />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function OperationsCard({ game, onNavigate }: { game: GameState; onNavigate: (v: ViewId) => void }) {
  return (
    <Card title="Production lines" icon={Factory} action={<button onClick={() => onNavigate("production")} className="text-xs text-emerald-400 hover:underline">Open</button>} bodyClassName="space-y-3">
      {(Object.keys(RECIPES) as RecipeId[]).map((id) => {
        const r = RECIPES[id];
        const st = game.stations[id];
        const crew = game.workers.filter((w) => taskKey(w.task) === `process:${id}`);
        const stalled = !st.running && st.queued > 0 && !r.inputs.every((i) => game.inventory[i.itemId] >= i.qty);
        const label = st.running ? "Running" : stalled ? "Needs inputs" : st.queued > 0 ? "Starting" : "Idle";
        return (
          <div key={id}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-zinc-200">{r.station}</span>
              <span className={`text-xs ${st.running ? "text-emerald-400" : stalled ? "text-amber-400" : "text-zinc-500"}`}>
                {label} · {st.queued} queued · {crew.length} {crew.length === 1 ? "worker" : "workers"}
              </span>
            </div>
            <ProgressBar value={st.running ? st.progressMs / r.durationMs : 0} />
          </div>
        );
      })}
    </Card>
  );
}

const STATUS_STYLE: Record<string, string> = {
  working: "bg-emerald-500/15 text-emerald-300",
  idle: "bg-zinc-800 text-zinc-400",
  stalled: "bg-amber-500/15 text-amber-300",
  full: "bg-rose-500/15 text-rose-300",
  unpaid: "bg-rose-500/15 text-rose-300",
};

function WorkforceCard({ game, onNavigate }: { game: GameState; onNavigate: (v: ViewId) => void }) {
  return (
    <Card title="Workforce" icon={Briefcase} action={<button onClick={() => onNavigate("workers")} className="text-xs text-emerald-400 hover:underline">Manage</button>} bodyClassName="p-0">
      {game.workers.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">No workers yet. Hire your first one to start automating.</p>
      ) : (
        <ul className="divide-y divide-zinc-800/70">
          {game.workers.slice(0, 6).map((w) => (
            <li key={w.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-zinc-200">{w.name}</span>
              <span className="tabular font-mono text-xs text-zinc-500">{selectors.workerOutputPerMin(w).toFixed(1)}/min</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[w.status]}`}>{w.status}</span>
            </li>
          ))}
          {game.workers.length > 6 && <li className="px-4 py-2 text-xs text-zinc-500">+{game.workers.length - 6} more</li>}
        </ul>
      )}
    </Card>
  );
}

function ActivityCard({ game }: { game: GameState }) {
  const entries = [...game.log].reverse().slice(0, 8);
  return (
    <Card title="Activity" icon={Gauge} bodyClassName="p-0">
      {entries.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">Trades, hires and level-ups will show up here.</p>
      ) : (
        <ul className="divide-y divide-zinc-800/70">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-2 px-4 py-2 text-[13px]">
              <Coins className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${e.tone === "good" ? "text-emerald-400" : e.tone === "bad" ? "text-rose-400" : "text-zinc-500"}`} aria-hidden />
              <span className="text-zinc-300">{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

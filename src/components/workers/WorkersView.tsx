"use client";

import { Briefcase, RefreshCw, UserMinus, UserPlus } from "lucide-react";
import { ITEMS, ITEM_IDS_ORDERED, MAX_WORKER_LEVEL, RECIPES, STAR_SPEED, TUNING, parseTaskKey, selectors, taskDuration, taskKey, workerSpeed, xpForNextLevel } from "@/lib/engine";
import { fmtMoney, fmtNum, fmtSigned, tone } from "@/lib/format";
import { useGame, useGameStore } from "@/hooks/useGameState";
import { Card, Stat } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Stars } from "@/components/ui/Stars";
import type { GameState, RecipeId, Worker, WorkerStatus } from "@/types/game";

const TASK_OPTIONS: { key: string; label: string; group: string }[] = [
  ...ITEM_IDS_ORDERED.filter((id) => ITEMS[id].gather).map((id) => ({ key: `gather:${id}`, label: `${ITEMS[id].gather?.verb} ${ITEMS[id].name}`, group: "Gathering" })),
  ...(Object.keys(RECIPES) as RecipeId[]).map((id) => ({ key: `process:${id}`, label: `${RECIPES[id].station} — ${RECIPES[id].name}`, group: "Production" })),
];

const STATUS: Record<WorkerStatus, { label: string; cls: string }> = {
  working: { label: "Working", cls: "bg-emerald-500/15 text-emerald-300" },
  idle: { label: "Idle", cls: "bg-zinc-800 text-zinc-400" },
  stalled: { label: "Waiting for inputs", cls: "bg-amber-500/15 text-amber-300" },
  full: { label: "Warehouse full", cls: "bg-rose-500/15 text-rose-300" },
  unpaid: { label: "Can't afford wages", cls: "bg-rose-500/15 text-rose-300" },
};

/** Estimated value a worker adds per minute (output value, minus input cost for refiners) minus wages. */
function workerNetPerMin(game: GameState, w: Worker): number {
  if (!w.task) return 0;
  const perMin = selectors.workerOutputPerMin(w);
  if (w.task.kind === "gather") return perMin * selectors.mid(game, w.task.itemId) - w.wagePerMin;
  const r = RECIPES[w.task.recipeId];
  const runsPerMin = (60_000 / r.durationMs) * workerSpeed(w);
  return runsPerMin * selectors.recipeMargin(game, w.task.recipeId).margin - w.wagePerMin;
}

export function WorkersView() {
  const game = useGame();
  const hire = useGameStore((s) => s.hireWorker);
  const refresh = useGameStore((s) => s.refreshCandidates);
  if (!game) return null;

  const full = game.workers.length >= TUNING.maxWorkers;
  const active = game.workers.filter((w) => w.status === "working");
  const payroll = game.workers.filter((w) => w.task).reduce((a, w) => a + w.wagePerMin, 0);
  const netTotal = game.workers.reduce((a, w) => a + workerNetPerMin(game, w), 0);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Headcount" value={`${game.workers.length}/${TUNING.maxWorkers}`} icon={Briefcase} />
        <Stat label="Working now" value={`${active.length}`} sub={`${game.workers.filter((w) => !w.task).length} idle`} />
        <Stat label="Payroll (assigned)" value={`${fmtMoney(payroll)}`} sub="per minute, only while working" />
        <Stat label="Est. net value" value={fmtSigned(netTotal)} valueClassName={tone(netTotal)} sub="per minute at current prices" />
      </div>

      <Card
        title="Applicants"
        icon={UserPlus}
        action={
          <button onClick={refresh} className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800" title={`Advertise for new applicants (${fmtMoney(TUNING.candidateRefreshCost)})`}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> New applicants · {fmtMoney(TUNING.candidateRefreshCost)}
          </button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {game.candidates.map((c) => {
            const afford = game.balance >= c.hireCost;
            return (
              <div key={c.id} className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                <div>
                  <div className="font-medium text-zinc-100">{c.name}</div>
                  <Stars count={c.stars} />
                </div>
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between"><dt className="text-zinc-500">Speed</dt><dd className="tabular font-mono text-zinc-300">×{STAR_SPEED[c.stars].toFixed(2)}</dd></div>
                  <div className="flex justify-between"><dt className="text-zinc-500">Wage</dt><dd className="tabular font-mono text-zinc-300">{fmtMoney(c.wagePerMin)}/min</dd></div>
                </dl>
                <button
                  onClick={() => hire(c.id)}
                  disabled={!afford || full}
                  className="mt-auto rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 transition-colors enabled:hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  {full ? "Roster full" : `Hire · ${fmtMoney(c.hireCost)}`}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Workers are paid only while they&apos;re actually producing, and they level up on the job (+4% speed per level).
        </p>
      </Card>

      <Card title="Your team" icon={Briefcase} bodyClassName="p-0">
        {game.workers.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Nobody on the payroll yet. Hire from the applicants above, then assign them a job.</p>
        ) : (
          <ul className="divide-y divide-zinc-800/70">
            {game.workers.map((w) => (
              <WorkerRow key={w.id} w={w} game={game} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function WorkerRow({ w, game }: { w: Worker; game: GameState }) {
  const assign = useGameStore((s) => s.assignWorker);
  const fire = useGameStore((s) => s.fireWorker);
  const st = STATUS[w.status];
  const net = workerNetPerMin(game, w);
  const cycle = w.task ? Math.min(1, w.progressMs / taskDuration(w.task)) : 0;

  return (
    <li className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-zinc-100">{w.name}</span>
          <Stars count={w.stars} size="h-3 w-3" />
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">
          <span className="tabular whitespace-nowrap font-mono">Lv {w.level}</span>
          {w.level < MAX_WORKER_LEVEL ? <ProgressBar value={w.xp / xpForNextLevel(w.level)} className="h-1 w-20" barClassName="bg-indigo-400" /> : <span className="text-indigo-300">MAX</span>}
          <span className="tabular whitespace-nowrap font-mono">×{workerSpeed(w).toFixed(2)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <select
          value={taskKey(w.task)}
          onChange={(e) => assign(w.id, parseTaskKey(e.target.value))}
          aria-label={`Job for ${w.name}`}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
        >
          <option value="idle">Idle — no job</option>
          {["Gathering", "Production"].map((group) => (
            <optgroup key={group} label={group}>
              {TASK_OPTIONS.filter((o) => o.group === group).map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ProgressBar value={cycle} barClassName={w.status === "working" ? "bg-emerald-500" : "bg-zinc-600"} />
      </div>

      <div className="space-y-1 text-xs">
        <span className={`inline-block rounded-full px-2 py-0.5 font-medium ${st.cls}`}>{st.label}</span>
        <div className="tabular flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-zinc-500">
          <span>{selectors.workerOutputPerMin(w).toFixed(1)}/min</span>
          <span>made {fmtNum(w.produced)}</span>
          <span>wage {fmtMoney(w.wagePerMin)}/min</span>
          {w.task && <span className={tone(net)}>≈ {fmtSigned(net)}/min</span>}
        </div>
      </div>

      <button
        onClick={() => window.confirm(`Let ${w.name} go? You won't get the hiring fee back.`) && fire(w.id)}
        className="justify-self-end rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-rose-400"
        aria-label={`Fire ${w.name}`}
        title="Let go"
      >
        <UserMinus className="h-4 w-4" />
      </button>
    </li>
  );
}

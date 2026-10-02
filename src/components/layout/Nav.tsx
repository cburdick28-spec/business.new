"use client";

import { Factory, LayoutDashboard, LineChart, Pickaxe, Users, type LucideIcon } from "lucide-react";

export type ViewId = "dashboard" | "gather" | "production" | "market" | "workers";

export const VIEWS: { id: ViewId; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "gather", label: "Gathering", icon: Pickaxe },
  { id: "production", label: "Production", icon: Factory },
  { id: "market", label: "Exchange", icon: LineChart },
  { id: "workers", label: "Workforce", icon: Users },
];

interface NavProps {
  view: ViewId;
  onChange: (v: ViewId) => void;
  badges: Partial<Record<ViewId, number>>;
}

export function Sidebar({ view, onChange, badges }: NavProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 md:flex">
      <div className="flex items-center gap-2.5 border-b border-zinc-800 px-5 py-4">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <LineChart className="h-4 w-4 text-emerald-400" aria-hidden />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-zinc-100">business.new</div>
          <div className="text-[11px] text-zinc-500">Economy sim · Phase 1</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3" aria-label="Main">
        {VIEWS.map(({ id, label, icon: Icon }) => {
          const active = id === view;
          const badge = badges[id];
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={active ? "page" : undefined}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-zinc-800/80 text-zinc-50" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300"}`} aria-hidden />
              <span className="flex-1 text-left">{label}</span>
              {badge ? <span className="tabular rounded-full bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300">{badge}</span> : null}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-zinc-800 p-4 text-[11px] leading-relaxed text-zinc-600">
        Progress saves automatically. Workers keep producing while you&apos;re away.
      </div>
    </aside>
  );
}

export function MobileNav({ view, onChange, badges }: NavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur md:hidden" aria-label="Main">
      {VIEWS.map(({ id, label, icon: Icon }) => {
        const active = id === view;
        const badge = badges[id];
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-current={active ? "page" : undefined}
            className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${active ? "text-emerald-400" : "text-zinc-500"}`}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
            {badge ? <span className="absolute right-3 top-1.5 rounded-full bg-zinc-700 px-1 text-[9px] text-zinc-100">{badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

"use client";

import { useState } from "react";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { GatherView } from "@/components/gather/GatherView";
import { MarketView } from "@/components/market/MarketView";
import { ProductionView } from "@/components/production/ProductionView";
import { WorkersView } from "@/components/workers/WorkersView";
import { Toasts } from "@/components/ui/Toasts";
import { useGameLoop } from "@/hooks/useGameLoop";
import { useGame } from "@/hooks/useGameState";
import { selectors } from "@/lib/engine";
import { OfflineReportModal } from "./OfflineReportModal";
import { MobileNav, Sidebar, VIEWS, type ViewId } from "./Nav";
import { TopBar } from "./TopBar";

export function AppShell() {
  useGameLoop();
  const game = useGame();
  const [view, setView] = useState<ViewId>("dashboard");

  if (!game) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-zinc-500">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Loading your company…
        </div>
      </div>
    );
  }

  const badges: Partial<Record<ViewId, number>> = {
    workers: game.workers.length,
    market: selectors.playerOrders(game).length,
  };
  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0];

  return (
    <div className="flex min-h-screen">
      <Sidebar view={view} onChange={setView} badges={badges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={current.label} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 pb-24 md:p-6 md:pb-8">
          {view === "dashboard" && <DashboardView onNavigate={setView} />}
          {view === "gather" && <GatherView onNavigate={setView} />}
          {view === "production" && <ProductionView />}
          {view === "market" && <MarketView />}
          {view === "workers" && <WorkersView />}
        </main>
      </div>
      <MobileNav view={view} onChange={setView} badges={badges} />
      <Toasts />
      <OfflineReportModal />
    </div>
  );
}

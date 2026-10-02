# business.new

A browser economy sim inspired by [Capital Rift](https://capitalrift.com): gather raw goods, refine them, trade on a
real order-book exchange, and hire workers who keep producing while you're away.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 3 · Zustand · lucide-react

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine unit tests (vitest)
npm run typecheck
npm run build
```

Deploys to Vercel as-is (import the GitHub repo; no env vars needed).

## How the game works (Phase 1)

| System | Rules |
| --- | --- |
| **Gathering** | Chop Wood / Mine Iron Ore by hand (cooldown-gated) or with assigned workers. |
| **Production** | Sawmill `2 wood → 1 plank`, Smelter `2 ore → 1 bar`, Nail Press `1 bar → 8 nails`. Timer-based; queue runs yourself or assign workers (each runs their own line). |
| **Exchange** | One order book per item, price-time priority. *Instant* (market) or *Limit* orders. Cash/goods are escrowed while an order rests. 1% fee on sales. Self-trades are blocked. |
| **Simulated players** | Bot makers keep a ladder of quotes around a hidden, mean-reverting "anchor" price; bot takers hit the book. Every trade — yours included — nudges the anchor, so dumping 400 planks really does crater the price, and processed goods are pulled toward their input cost. |
| **Workers** | Random 1–5★ rating (speed ×0.7–×1.45), wage and hiring fee scale with stars, level up while working (+4%/level). **Paid only while actually producing**; they stall without inputs and stop if you can't pay. |
| **Auto-sell** | Per-item rule: keep N units, never sell below $X. Runs every 5s, including offline. |
| **P&L** | Operating net income per minute (sales − purchases − wages − fees, trailing 5 min), net worth history, lifetime totals. One-time hiring costs are shown separately. |
| **Offline** | On load the world is fast-forwarded (up to 8h) and a "welcome back" report is shown. |

## Architecture

```
src/
  app/                     Next.js App Router (layout, page, globals.css)
  components/
    layout/                AppShell, Nav, TopBar, OfflineReportModal
    dashboard/             DashboardView (KPIs, P&L, inventory, ops, feed)
    gather/ production/ market/ workers/    one view per game system
    ui/                    Card, Stat, ProgressBar, Sparkline, Stars, Controls, Toasts
    itemVisuals.ts         icons/colours per item (presentation only)
  hooks/
    useGameState.ts        Zustand store — the only place UI talks to the engine
    useGameLoop.ts         boot, real-time tick, autosave
  lib/
    engine/                PURE TypeScript game rules (no React, no browser APIs)
      config.ts            items, recipes, tuning constants
      orderBook.ts         matching, escrow, cancel
      market.ts            bot liquidity + price dynamics
      production.ts        stations + worker simulation
      actions.ts           player commands (gather, trade, hire, assign, …)
      selectors.ts         derived values (net worth, P&L, book levels, estimates)
      index.ts             createInitialState / advance / simulateOffline
      __tests__/           vitest suite
    persistence.ts         GameRepository interface + localStorage implementation
    format.ts
  types/game.ts            all domain types (plain JSON — DB-ready)
```

**Rules of the road**

- `lib/engine` never imports React or touches `window`. State is plain JSON and the PRNG state lives inside it, so a
  simulation is reproducible (`createInitialState(seed)`) and testable.
- Components read state with `useGame()` / selectors and call store actions; they contain no game rules.
- Every player command has the shape `(state, input) => result`, i.e. what an API route would look like.

## Adding content

- **New item:** add its id to `ITEM_IDS` in `types/game.ts`, an entry in `ITEMS` (`lib/engine/config.ts`),
  a visual in `components/itemVisuals.ts`, and add it to `ITEM_IDS_ORDERED`.
- **New recipe/station:** add to `RECIPE_IDS` and `RECIPES`. The UI, worker task list, margins and price coupling pick it up.
- **Tuning:** everything economic is in `TUNING`, `STAR_*`, `wageForStars` and `hireCostForStars`.
- Changing the shape of `GameState`? Bump `SAVE_VERSION` — incompatible saves are discarded.

## Going multiplayer / adding a backend

1. Implement `GameRepository` (`lib/persistence.ts`) with Supabase/Prisma and return it from `getRepository()`.
2. Move `lib/engine` behind route handlers or a worker so the **server** is authoritative: the store's command
   methods become `fetch` calls and `tick` becomes a subscription. Client-side gathering cooldowns, offline catch-up and
   the bot market are all client-trusted today and **must** move server-side before real players share an economy.
3. Replace the bot market with real player orders — the order book already treats `owner` generically.

## Known Phase 1 limits

- Single-player; localStorage only; the market "other players" are simulated.
- No ESLint config is included (add one before opening the repo to contributors).

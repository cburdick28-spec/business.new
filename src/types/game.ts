/**
 * Shared domain types for the economy sim.
 *
 * Everything in `GameState` is plain JSON (no classes, Maps or Dates) so the
 * whole world can be persisted to localStorage today and to Postgres/Supabase
 * (or sent over the wire by a server-authoritative engine) later.
 */

/* ------------------------------------------------------------------ */
/* Static definitions                                                  */
/* ------------------------------------------------------------------ */

export const ITEM_IDS = ["wood", "iron_ore", "planks", "iron_bar", "nails"] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export const RECIPE_IDS = ["sawmill", "smelter", "nail_press"] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];

export type ItemCategory = "raw" | "processed" | "component";

export interface ItemDef {
  id: ItemId;
  name: string;
  category: ItemCategory;
  /** Long-run fair value the market mean-reverts towards. */
  basePrice: number;
  /** Per-sqrt(second) price volatility, as a fraction of price. */
  volatility: number;
  /** Typical order size multiplier; also how hard trades move the price. */
  depthScale: number;
  /** Present for items that can be gathered by hand / by workers. */
  gather?: { baseMs: number; yield: number; verb: string };
}

export interface RecipeDef {
  id: RecipeId;
  name: string;
  station: string;
  inputs: { itemId: ItemId; qty: number }[];
  output: { itemId: ItemId; qty: number };
  durationMs: number;
}

/* ------------------------------------------------------------------ */
/* Market                                                              */
/* ------------------------------------------------------------------ */

export type Side = "buy" | "sell";
export type OrderOwner = "player" | "bot";
export type OrderKind = "market" | "limit";

export interface Order {
  id: string;
  itemId: ItemId;
  side: Side;
  price: number;
  /** Quantity at placement. */
  qty: number;
  /** Quantity still resting on the book. */
  remaining: number;
  owner: OrderOwner;
  /** Game-clock ms at placement (time priority). */
  createdAt: number;
}

export interface OrderBook {
  /** Sorted best (highest) first, then oldest first. */
  bids: Order[];
  /** Sorted best (lowest) first, then oldest first. */
  asks: Order[];
}

export interface PricePoint {
  t: number;
  price: number;
}

export interface TradePrint {
  t: number;
  price: number;
  qty: number;
  /** Aggressor side. */
  side: Side;
}

export interface MarketState {
  book: OrderBook;
  /** Hidden "reference price" the bot liquidity is quoted around. */
  anchor: number;
  /** Random phase for the slow demand cycle. */
  phase: number;
  lastPrice: number;
  /** Decaying traded volume (for the "activity" readout). */
  volume: number;
  history: PricePoint[];
  trades: TradePrint[];
}

/* ------------------------------------------------------------------ */
/* Production & staffing                                               */
/* ------------------------------------------------------------------ */

export interface StationState {
  /** Manual runs queued by the player. */
  queued: number;
  progressMs: number;
  /** True once the inputs for the current run were consumed. */
  running: boolean;
}

export type Task =
  | { kind: "gather"; itemId: ItemId }
  | { kind: "process"; recipeId: RecipeId };

export type WorkerStatus = "idle" | "working" | "stalled" | "full" | "unpaid";

export interface Worker {
  id: string;
  name: string;
  /** 1-5 star hire rating (random at hire time). */
  stars: number;
  /** Levels up while working, 1-10. */
  level: number;
  xp: number;
  /** Base wage per minute; only paid while actually producing. */
  wagePerMin: number;
  task: Task | null;
  progressMs: number;
  /** True once the inputs for the current process cycle were consumed. */
  cycleActive: boolean;
  status: WorkerStatus;
  produced: number;
  earnedWages: number;
  hiredAt: number;
}

/** Standing instruction: sell surplus stock on the exchange automatically. */
export interface AutoSellRule {
  enabled: boolean;
  /** Units to hold back (e.g. inputs your own stations need). */
  keep: number;
  /** Never sell below this price. */
  minPrice: number;
}

export interface WorkerCandidate {
  id: string;
  name: string;
  stars: number;
  wagePerMin: number;
  hireCost: number;
}

/* ------------------------------------------------------------------ */
/* Ledger / P&L                                                        */
/* ------------------------------------------------------------------ */

export type LedgerKind = "revenue" | "purchases" | "wages" | "fees" | "hiring";

export interface LedgerTotals {
  revenue: number;
  purchases: number;
  wages: number;
  fees: number;
  hiring: number;
}

export interface LedgerBucket extends LedgerTotals {
  /** Bucket start on the game clock (ms). */
  t: number;
}

export interface NetWorthPoint {
  t: number;
  value: number;
}

export interface LogEntry {
  id: string;
  t: number;
  tone: "info" | "good" | "bad";
  text: string;
}

/* ------------------------------------------------------------------ */
/* Root state                                                          */
/* ------------------------------------------------------------------ */

export interface GameState {
  /** Save-format version; bump when the shape changes. */
  version: number;
  /** Game clock in ms (advances only through `advance`). */
  time: number;
  /** PRNG state (uint32) — keeps the simulation reproducible/testable. */
  rng: number;
  /** Monotonic counter for ids. */
  nextId: number;
  balance: number;
  inventory: Record<ItemId, number>;
  market: Record<ItemId, MarketState>;
  stations: Record<RecipeId, StationState>;
  /** Game-clock time at which each node can be hand-gathered again. */
  gatherReadyAt: Partial<Record<ItemId, number>>;
  autoSell: Record<ItemId, AutoSellRule>;
  workers: Worker[];
  candidates: WorkerCandidate[];
  ledger: { buckets: LedgerBucket[]; totals: LedgerTotals };
  netWorthHistory: NetWorthPoint[];
  log: LogEntry[];
}

/* ------------------------------------------------------------------ */
/* Action results                                                      */
/* ------------------------------------------------------------------ */

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface TradeResult extends ActionResult {
  filled: number;
  avgPrice: number;
  /** Quantity left resting on the book (limit orders). */
  resting: number;
  orderId?: string;
}

export interface PlaceOrderInput {
  itemId: ItemId;
  side: Side;
  kind: OrderKind;
  qty: number;
  /** Required for limit orders. */
  price?: number;
}

export interface OfflineReport {
  elapsedMs: number;
  cashDelta: number;
  inventoryDelta: Partial<Record<ItemId, number>>;
  simulatedMs: number;
}

export interface PersistedGame {
  version: number;
  savedAt: number;
  state: GameState;
}

import type { ItemDef, ItemId, RecipeDef, RecipeId } from "@/types/game";

/** Bump when `GameState` changes shape; old saves are discarded. */
export const SAVE_VERSION = 1;

export const TUNING = {
  startBalance: 300,
  /** Exchange fee charged to the seller on every fill. */
  feeRate: 0.01,
  /** Max units of one item the warehouse holds (blocks production when full). */
  inventoryCap: 1000,
  maxWorkers: 12,
  candidateSlots: 4,
  candidateRefreshCost: 15,

  /** Real-time loop interval; the engine itself accepts any dt. */
  tickMs: 500,
  maxOfflineMs: 8 * 60 * 60 * 1000,

  ledgerBucketMs: 5_000,
  ledgerBucketsKept: 720,
  netWorthSampleMs: 10_000,
  netWorthKept: 360,
  priceSampleMs: 5_000,
  priceHistoryKept: 180,
  tradesKept: 30,
  logKept: 40,

  /** Simulated "other players". */
  botOrdersPerSide: 9,
  botHalfSpread: 0.012,
  botMaxOffset: 0.14,
  /** Expected bot market orders per second, per item. */
  botTakerRate: 0.4,
  /** Per-second probability a resting bot order is pulled (keeps the book alive). */
  botChurnRate: 0.015,
  /** Anchor mean-reversion speed per second. */
  anchorReversion: 0.004,
  /** Trade size (in multiples of depthScale) that moves the anchor ~100%/IMPACT_DIV. */
  impactDivisor: 300,
  impactCap: 0.03,

  manualGatherCooldownMs: { wood: 3_000, iron_ore: 4_500 } as Partial<Record<ItemId, number>>,
  maxQueuedRuns: 999,
  autoSellEveryMs: 5_000,
  autoSellMaxPerRun: 200,
} as const;

export const ITEMS: Record<ItemId, ItemDef> = {
  wood: {
    id: "wood",
    name: "Raw Wood",
    category: "raw",
    basePrice: 4,
    volatility: 0.0018,
    depthScale: 4,
    gather: { baseMs: 4_000, yield: 1, verb: "Chop" },
  },
  iron_ore: {
    id: "iron_ore",
    name: "Iron Ore",
    category: "raw",
    basePrice: 6,
    volatility: 0.002,
    depthScale: 3,
    gather: { baseMs: 6_000, yield: 1, verb: "Mine" },
  },
  planks: {
    id: "planks",
    name: "Planks",
    category: "processed",
    basePrice: 11.5,
    volatility: 0.0016,
    depthScale: 2,
  },
  iron_bar: {
    id: "iron_bar",
    name: "Iron Bars",
    category: "processed",
    basePrice: 17,
    volatility: 0.0018,
    depthScale: 2,
  },
  nails: {
    id: "nails",
    name: "Nails",
    category: "component",
    basePrice: 2.6,
    volatility: 0.0022,
    depthScale: 12,
  },
};

export const RECIPES: Record<RecipeId, RecipeDef> = {
  sawmill: {
    id: "sawmill",
    name: "Saw Planks",
    station: "Sawmill",
    inputs: [{ itemId: "wood", qty: 2 }],
    output: { itemId: "planks", qty: 1 },
    durationMs: 5_000,
  },
  smelter: {
    id: "smelter",
    name: "Smelt Iron Bars",
    station: "Smelter",
    inputs: [{ itemId: "iron_ore", qty: 2 }],
    output: { itemId: "iron_bar", qty: 1 },
    durationMs: 7_000,
  },
  nail_press: {
    id: "nail_press",
    name: "Press Nails",
    station: "Nail Press",
    inputs: [{ itemId: "iron_bar", qty: 1 }],
    output: { itemId: "nails", qty: 8 },
    durationMs: 6_000,
  },
};

export const ITEM_IDS_ORDERED: ItemId[] = ["wood", "iron_ore", "planks", "iron_bar", "nails"];

/** Recipe that produces an item (undefined for raw materials). */
export const RECIPE_BY_OUTPUT: Partial<Record<ItemId, RecipeDef>> = Object.fromEntries(
  Object.values(RECIPES).map((r) => [r.output.itemId, r]),
);

export const WORKER_NAMES = [
  "Ava", "Marco", "Lena", "Diego", "Priya", "Tomás", "Hana", "Omar", "Sofia", "Jonas",
  "Mei", "Rafael", "Zoe", "Ibrahim", "Clara", "Kenji", "Nadia", "Luca", "Aisha", "Viktor",
  "Elena", "Mateo", "Freya", "Hugo", "Yara", "Felix", "Noor", "Sam",
];
export const WORKER_SURNAMES = [
  "Reyes", "Okafor", "Lindqvist", "Tanaka", "Moreau", "Haddad", "Novak", "Silva",
  "Kowalski", "Bianchi", "Duarte", "Yilmaz", "Andersen", "Park", "Mensah", "Rossi",
];

/** Hire-rating odds for the 1-5 star roll. */
export const STAR_WEIGHTS: [number, number][] = [
  [1, 30],
  [2, 30],
  [3, 22],
  [4, 12],
  [5, 6],
];

export const STAR_SPEED: Record<number, number> = { 1: 0.7, 2: 0.85, 3: 1, 4: 1.2, 5: 1.45 };
export const MAX_WORKER_LEVEL = 10;
export const LEVEL_SPEED_BONUS = 0.04;

export const wageForStars = (stars: number): number => 8 + stars * 5;
export const hireCostForStars = (stars: number): number => 40 + stars * stars * 20;

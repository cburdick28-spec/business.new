"use client";

import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { GameState, MarketOrder, Recipe } from "../types/game";

const STORAGE_KEY = "capital-rift-mvp-game-state";
const TICK_MS = 1_000;

type ManufacturingJob = {
  id: string;
  recipeId: string;
  remainingMs: number;
};

type RuntimeState = GameState & {
  manufacturingQueue: ManufacturingJob[];
  workerRecipeProgressMs: Record<string, number>;
};

const RECIPES: Recipe[] = [
  {
    id: "smelt-ore-to-ingot",
    name: "Smelt Ore",
    inputResources: [{ resourceId: "ore", quantity: 3 }],
    outputResource: { resourceId: "ingot", quantity: 1 },
    productionTimeMs: 5_000,
  },
  {
    id: "forge-ingot-to-plate",
    name: "Forge Plate",
    inputResources: [{ resourceId: "ingot", quantity: 2 }],
    outputResource: { resourceId: "plate", quantity: 1 },
    productionTimeMs: 8_000,
  },
];

const STARTING_STATE: RuntimeState = {
  balance: 1_000,
  inventory: [
    { id: "ore", name: "Ore", quantity: 0, category: "raw" },
    { id: "ingot", name: "Ingot", quantity: 0, category: "refined" },
    { id: "plate", name: "Plate", quantity: 0, category: "refined" },
  ],
  marketOrders: [],
  workers: [
    {
      id: "worker-1",
      name: "Ava",
      skillLevel: 1,
      assignedTaskId: null,
      costPerMinute: 12,
    },
  ],
  manufacturingQueue: [],
  workerRecipeProgressMs: {},
};

type GameStateContextValue = RuntimeState & {
  recipes: Recipe[];
  gatherResource: (resourceId: string) => void;
  startManufacturing: (recipeId: string) => boolean;
  createMarketOrder: (
    order: Omit<MarketOrder, "id" | "playerOwned"> & { playerOwned?: boolean },
  ) => void;
  cancelMarketOrder: (orderId: string) => void;
  setWorkerTask: (workerId: string, taskId: string | null) => void;
};

const GameStateContext = createContext<GameStateContextValue | null>(null);

const clampAtZero = (value: number): number => (value < 0 ? 0 : value);

const makeId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const readStoredState = (): RuntimeState => {
  if (typeof window === "undefined") {
    return STARTING_STATE;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return STARTING_STATE;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RuntimeState>;
    return {
      ...STARTING_STATE,
      ...parsed,
      inventory: parsed.inventory ?? STARTING_STATE.inventory,
      marketOrders: parsed.marketOrders ?? STARTING_STATE.marketOrders,
      workers: parsed.workers ?? STARTING_STATE.workers,
      manufacturingQueue:
        parsed.manufacturingQueue ?? STARTING_STATE.manufacturingQueue,
      workerRecipeProgressMs:
        parsed.workerRecipeProgressMs ?? STARTING_STATE.workerRecipeProgressMs,
    };
  } catch {
    return STARTING_STATE;
  }
};

const hasEnoughInputs = (state: RuntimeState, recipe: Recipe): boolean =>
  recipe.inputResources.every((input) => {
    const resource = state.inventory.find((item) => item.id === input.resourceId);
    return (resource?.quantity ?? 0) >= input.quantity;
  });

const consumeRecipeInputs = (state: RuntimeState, recipe: Recipe): RuntimeState => ({
  ...state,
  inventory: state.inventory.map((resource) => {
    const recipeInput = recipe.inputResources.find(
      (input) => input.resourceId === resource.id,
    );
    if (!recipeInput) {
      return resource;
    }

    return {
      ...resource,
      quantity: clampAtZero(resource.quantity - recipeInput.quantity),
    };
  }),
});

const addRecipeOutput = (state: RuntimeState, recipe: Recipe): RuntimeState => {
  const existingOutput = state.inventory.find(
    (resource) => resource.id === recipe.outputResource.resourceId,
  );

  if (!existingOutput) {
    return {
      ...state,
      inventory: [
        ...state.inventory,
        {
          id: recipe.outputResource.resourceId,
          name: recipe.outputResource.resourceId,
          quantity: recipe.outputResource.quantity,
          category: "refined",
        },
      ],
    };
  }

  return {
    ...state,
    inventory: state.inventory.map((resource) =>
      resource.id === recipe.outputResource.resourceId
        ? {
            ...resource,
            quantity: resource.quantity + recipe.outputResource.quantity,
          }
        : resource,
    ),
  };
};

const resolveRecipeProduction = (state: RuntimeState, recipe: Recipe): RuntimeState => {
  if (!hasEnoughInputs(state, recipe)) {
    return state;
  }

  return addRecipeOutput(consumeRecipeInputs(state, recipe), recipe);
};

const runMarketBackgroundSimulation = (state: RuntimeState): RuntimeState => {
  const nonPlayerOrders = state.marketOrders.filter((order) => !order.playerOwned);
  if (nonPlayerOrders.length === 0) {
    return state;
  }

  const updatedOrders = state.marketOrders.map((order) => {
    if (order.playerOwned) {
      return order;
    }

    const shouldTrade = Math.random() < 0.2;
    const shouldMovePrice = Math.random() < 0.35;

    const quantityAfterTrade = shouldTrade
      ? clampAtZero(order.quantity - Math.max(1, Math.floor(Math.random() * 3)))
      : order.quantity;

    const priceShift = shouldMovePrice
      ? (Math.random() - 0.5) * Math.max(1, order.price * 0.08)
      : 0;

    return {
      ...order,
      quantity: quantityAfterTrade,
      price: Number(clampAtZero(order.price + priceShift).toFixed(2)),
    };
  });

  return {
    ...state,
    marketOrders: updatedOrders.filter((order) => order.quantity > 0),
  };
};

const tickState = (state: RuntimeState): RuntimeState => {
  let nextState: RuntimeState = {
    ...state,
    balance: clampAtZero(
      state.balance -
        state.workers.reduce((sum, worker) => sum + worker.costPerMinute / 60, 0),
    ),
  };

  for (const worker of nextState.workers) {
    if (!worker.assignedTaskId) {
      continue;
    }

    const assignedRecipe = RECIPES.find((recipe) => recipe.id === worker.assignedTaskId);
    if (assignedRecipe) {
      const currentProgress = nextState.workerRecipeProgressMs[worker.id] ?? 0;
      const updatedProgress = currentProgress + TICK_MS * Math.max(worker.skillLevel, 1);

      nextState = {
        ...nextState,
        workerRecipeProgressMs: {
          ...nextState.workerRecipeProgressMs,
          [worker.id]: updatedProgress,
        },
      };

      if (updatedProgress >= assignedRecipe.productionTimeMs) {
        nextState = resolveRecipeProduction(nextState, assignedRecipe);
        nextState = {
          ...nextState,
          workerRecipeProgressMs: {
            ...nextState.workerRecipeProgressMs,
            [worker.id]: updatedProgress - assignedRecipe.productionTimeMs,
          },
        };
      }
      continue;
    }

    nextState = {
      ...nextState,
      inventory: nextState.inventory.map((resource) =>
        resource.id === worker.assignedTaskId
          ? { ...resource, quantity: resource.quantity + Math.max(worker.skillLevel, 1) }
          : resource,
      ),
    };
  }

  if (nextState.manufacturingQueue.length > 0) {
    const queueAfterTick: ManufacturingJob[] = [];

    for (const job of nextState.manufacturingQueue) {
      const recipe = RECIPES.find((item) => item.id === job.recipeId);
      if (!recipe) {
        continue;
      }

      const remainingMs = job.remainingMs - TICK_MS;
      if (remainingMs > 0) {
        queueAfterTick.push({ ...job, remainingMs });
        continue;
      }

      nextState = resolveRecipeProduction(nextState, recipe);
    }

    nextState = { ...nextState, manufacturingQueue: queueAfterTick };
  }

  return runMarketBackgroundSimulation(nextState);
};

export const GameStateProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<RuntimeState>(STARTING_STATE);

  useEffect(() => {
    setState(readStoredState());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setState((current) => tickState(current));
    }, TICK_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const gatherResource = useCallback((resourceId: string) => {
    setState((current) => ({
      ...current,
      inventory: current.inventory.map((resource) =>
        resource.id === resourceId
          ? { ...resource, quantity: resource.quantity + 1 }
          : resource,
      ),
    }));
  }, []);

  const startManufacturing = useCallback((recipeId: string): boolean => {
    const recipe = RECIPES.find((entry) => entry.id === recipeId);
    if (!recipe) {
      return false;
    }

    let started = false;
    setState((current) => {
      if (!hasEnoughInputs(current, recipe)) {
        started = false;
        return current;
      }

      started = true;
      return {
        ...consumeRecipeInputs(current, recipe),
        manufacturingQueue: [
          ...current.manufacturingQueue,
          { id: makeId(), recipeId, remainingMs: recipe.productionTimeMs },
        ],
      };
    });

    return started;
  }, []);

  const createMarketOrder = useCallback(
    (
      order: Omit<MarketOrder, "id" | "playerOwned"> & { playerOwned?: boolean },
    ) => {
      setState((current) => ({
        ...current,
        marketOrders: [
          ...current.marketOrders,
          {
            ...order,
            id: makeId(),
            playerOwned: order.playerOwned ?? true,
          },
        ],
      }));
    },
    [],
  );

  const cancelMarketOrder = useCallback((orderId: string) => {
    setState((current) => ({
      ...current,
      marketOrders: current.marketOrders.filter((order) => order.id !== orderId),
    }));
  }, []);

  const setWorkerTask = useCallback((workerId: string, taskId: string | null) => {
    setState((current) => ({
      ...current,
      workers: current.workers.map((worker) =>
        worker.id === workerId ? { ...worker, assignedTaskId: taskId } : worker,
      ),
    }));
  }, []);

  const value = useMemo<GameStateContextValue>(
    () => ({
      ...state,
      recipes: RECIPES,
      gatherResource,
      startManufacturing,
      createMarketOrder,
      cancelMarketOrder,
      setWorkerTask,
    }),
    [
      cancelMarketOrder,
      createMarketOrder,
      gatherResource,
      setWorkerTask,
      startManufacturing,
      state,
    ],
  );

  return createElement(GameStateContext.Provider, { value }, children);
};

export const useGameState = (): GameStateContextValue => {
  const context = useContext(GameStateContext);
  if (!context) {
    throw new Error("useGameState must be used within a GameStateProvider");
  }

  return context;
};

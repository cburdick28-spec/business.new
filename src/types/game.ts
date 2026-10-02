export type ResourceCategory = "raw" | "refined";

export interface Resource {
  id: string;
  name: string;
  quantity: number;
  category: ResourceCategory;
}

export interface RecipeInput {
  resourceId: string;
  quantity: number;
}

export interface RecipeOutput {
  resourceId: string;
  quantity: number;
}

export interface Recipe {
  id: string;
  name: string;
  inputResources: RecipeInput[];
  outputResource: RecipeOutput;
  productionTimeMs: number;
}

export type MarketOrderType = "BUY" | "SELL";

export interface MarketOrder {
  id: string;
  type: MarketOrderType;
  resourceId: string;
  price: number;
  quantity: number;
  playerOwned: boolean;
}

export interface Worker {
  id: string;
  name: string;
  skillLevel: number;
  assignedTaskId: string | null;
  costPerMinute: number;
}

export interface GameState {
  balance: number;
  inventory: Resource[];
  marketOrders: MarketOrder[];
  workers: Worker[];
}

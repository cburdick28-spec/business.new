import { Cuboid, Layers, Mountain, Pin, TreePine, type LucideIcon } from "lucide-react";
import type { ItemId } from "@/types/game";

/** Presentation-only metadata (kept out of the engine on purpose). */
export interface ItemVisual {
  icon: LucideIcon;
  text: string;
  bg: string;
  ring: string;
  bar: string;
  stroke: string;
}

export const ITEM_VISUALS: Record<ItemId, ItemVisual> = {
  wood: { icon: TreePine, text: "text-lime-400", bg: "bg-lime-500/10", ring: "ring-lime-500/30", bar: "bg-lime-500", stroke: "#a3e635" },
  iron_ore: { icon: Mountain, text: "text-sky-400", bg: "bg-sky-500/10", ring: "ring-sky-500/30", bar: "bg-sky-500", stroke: "#38bdf8" },
  planks: { icon: Layers, text: "text-amber-400", bg: "bg-amber-500/10", ring: "ring-amber-500/30", bar: "bg-amber-500", stroke: "#fbbf24" },
  iron_bar: { icon: Cuboid, text: "text-cyan-300", bg: "bg-cyan-400/10", ring: "ring-cyan-400/30", bar: "bg-cyan-400", stroke: "#67e8f9" },
  nails: { icon: Pin, text: "text-violet-400", bg: "bg-violet-500/10", ring: "ring-violet-500/30", bar: "bg-violet-500", stroke: "#a78bfa" },
};

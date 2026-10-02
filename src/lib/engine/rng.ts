/** Tiny seeded PRNG (mulberry32) whose state lives inside GameState. */
export interface RngHolder {
  rng: number;
}

export function rand(s: RngHolder): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Inclusive integer in [min, max]. */
export function randInt(s: RngHolder, min: number, max: number): number {
  return min + Math.floor(rand(s) * (max - min + 1));
}

/** Standard normal via Box–Muller. */
export function gauss(s: RngHolder): number {
  const u = Math.max(rand(s), 1e-12);
  const v = rand(s);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Exponential with the given mean. */
export function expo(s: RngHolder, mean: number): number {
  return -Math.log(1 - rand(s)) * mean;
}

export function pickWeighted<T>(s: RngHolder, entries: [T, number][]): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rand(s) * total;
  for (const [value, weight] of entries) {
    r -= weight;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

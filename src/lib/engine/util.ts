/** Round to 4 decimals — keeps float dust out of balances and ledgers. */
export const money = (n: number): number => Math.round(n * 1e4) / 1e4;
/** Market prices are quoted to the cent. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

import type { GameState, LedgerBucket, LedgerKind, LogEntry } from "@/types/game";
import { TUNING } from "./config";
import { money } from "./util";

/** Add a (positive) amount to the P&L ledger for the current time bucket. */
export function record(s: GameState, kind: LedgerKind, amount: number): void {
  if (!(amount > 0)) return;
  const t = Math.floor(s.time / TUNING.ledgerBucketMs) * TUNING.ledgerBucketMs;
  const buckets = s.ledger.buckets;
  let bucket: LedgerBucket | undefined = buckets[buckets.length - 1];
  if (!bucket || bucket.t !== t) {
    bucket = { t, revenue: 0, purchases: 0, wages: 0, fees: 0, hiring: 0 };
    buckets.push(bucket);
    if (buckets.length > TUNING.ledgerBucketsKept) buckets.shift();
  }
  bucket[kind] = money(bucket[kind] + amount);
  s.ledger.totals[kind] = money(s.ledger.totals[kind] + amount);
}

export function pushLog(s: GameState, tone: LogEntry["tone"], text: string): void {
  s.log.push({ id: `l${(s.nextId++).toString(36)}`, t: s.time, tone, text });
  if (s.log.length > TUNING.logKept) s.log.splice(0, s.log.length - TUNING.logKept);
}

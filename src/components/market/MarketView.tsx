"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardList, ListOrdered, Repeat, X } from "lucide-react";
import { ITEMS, ITEM_IDS_ORDERED, TUNING, selectors } from "@/lib/engine";
import { fmtMoney, fmtClock, fmtNum, fmtPct, tone } from "@/lib/format";
import { useGame, useGameStore } from "@/hooks/useGameState";
import { ITEM_VISUALS } from "@/components/itemVisuals";
import { Card } from "@/components/ui/Card";
import { NumberField, SegTabs, Switch } from "@/components/ui/Controls";
import { Sparkline } from "@/components/ui/Sparkline";
import type { GameState, ItemId, OrderKind, Side } from "@/types/game";

export function MarketView() {
  const game = useGame();
  const [itemId, setItemId] = useState<ItemId>("wood");
  const [side, setSide] = useState<Side>("buy");
  const [kind, setKind] = useState<OrderKind>("market");
  const [price, setPrice] = useState("");

  useEffect(() => setPrice(""), [itemId]);
  if (!game) return null;

  const pickPrice = (p: number, bookSide: Side) => {
    // Clicking a bid hits it (sell); clicking an ask lifts it (buy).
    setKind("limit");
    setSide(bookSide === "buy" ? "sell" : "buy");
    setPrice(p.toFixed(2));
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid gap-4 lg:grid-cols-12 md:gap-6">
        <Watchlist game={game} selected={itemId} onSelect={setItemId} className="lg:col-span-3" />
        <div className="space-y-4 md:space-y-6 lg:col-span-5">
          <ChartCard game={game} itemId={itemId} />
          <BookCard game={game} itemId={itemId} onPick={pickPrice} />
        </div>
        <div className="space-y-4 md:space-y-6 lg:col-span-4">
          <TicketCard game={game} itemId={itemId} side={side} setSide={setSide} kind={kind} setKind={setKind} price={price} setPrice={setPrice} />
          <AutoSellCard game={game} itemId={itemId} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3 md:gap-6">
        <OpenOrdersCard game={game} className="lg:col-span-2" />
        <TradesCard game={game} itemId={itemId} />
      </div>
    </div>
  );
}

/* ----------------------------- watchlist ----------------------------- */

function Watchlist({ game, selected, onSelect, className }: { game: GameState; selected: ItemId; onSelect: (id: ItemId) => void; className?: string }) {
  return (
    <div className={`flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible ${className ?? ""}`}>
      {ITEM_IDS_ORDERED.map((id) => {
        const v = ITEM_VISUALS[id];
        const m = game.market[id];
        const chg = selectors.priceChange(game, id);
        const active = id === selected;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            aria-pressed={active}
            className={`min-w-[170px] rounded-xl border p-3 text-left transition-colors lg:min-w-0 ${
              active ? "border-zinc-600 bg-zinc-800/70" : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className={`grid h-7 w-7 place-items-center rounded-lg ring-1 ${v.bg} ${v.ring}`}>
                <v.icon className={`h-3.5 w-3.5 ${v.text}`} aria-hidden />
              </span>
              <span className="flex-1 truncate text-sm font-medium text-zinc-100">{ITEMS[id].name}</span>
              <span className="tabular font-mono text-[11px] text-zinc-500">{fmtNum(game.inventory[id])}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div>
                <div className="tabular font-mono text-base font-semibold text-zinc-50">${selectors.mid(game, id).toFixed(2)}</div>
                <div className={`tabular font-mono text-[11px] ${tone(chg)}`}>{fmtPct(chg)}</div>
              </div>
              <div className="w-20">
                <Sparkline values={m.history.slice(-40).map((p) => p.price)} stroke={v.stroke} height={28} fill={false} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- chart ------------------------------- */

function FlashPrice({ value, className = "" }: { value: number; className?: string }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<{ dir: "up" | "down"; key: number } | null>(null);
  useEffect(() => {
    if (value !== prev.current) {
      setFlash({ dir: value > prev.current ? "up" : "down", key: Date.now() });
      prev.current = value;
    }
  }, [value]);
  return (
    <span key={flash?.key} className={`rounded px-1 ${flash ? (flash.dir === "up" ? "animate-flash-up" : "animate-flash-down") : ""} ${className}`}>
      {value.toFixed(2)}
    </span>
  );
}

function ChartCard({ game, itemId }: { game: GameState; itemId: ItemId }) {
  const v = ITEM_VISUALS[itemId];
  const m = game.market[itemId];
  const mid = selectors.mid(game, itemId);
  const { bid, ask } = selectors.bestBidAsk(game, itemId);
  const chg = selectors.priceChange(game, itemId);
  const series = m.history.map((p) => p.price);
  series.push(mid);
  const hi = Math.max(...series);
  const lo = Math.min(...series);
  const spread = bid !== undefined && ask !== undefined ? ask - bid : undefined;

  return (
    <Card bodyClassName="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-xl ring-1 ${v.bg} ${v.ring}`}>
            <v.icon className={`h-5 w-5 ${v.text}`} aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold text-zinc-50">{ITEMS[itemId].name}</h2>
            <div className="flex items-baseline gap-2">
              <FlashPrice value={mid} className="tabular font-mono text-2xl font-semibold text-zinc-50" />
              <span className={`tabular font-mono text-sm ${tone(chg)}`}>{fmtPct(chg)} <span className="text-zinc-600">3m</span></span>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-x-5 text-right text-xs">
          <Quote label="Bid" value={bid} cls="text-emerald-400" />
          <Quote label="Ask" value={ask} cls="text-rose-400" />
          <Quote label="Spread" value={spread} cls="text-zinc-300" />
        </dl>
      </div>
      <div className="relative">
        <Sparkline values={series} stroke={v.stroke} height={150} />
        <span className="tabular pointer-events-none absolute left-1 top-0 font-mono text-[10px] text-zinc-600">{hi.toFixed(2)}</span>
        <span className="tabular pointer-events-none absolute bottom-0 left-1 font-mono text-[10px] text-zinc-600">{lo.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-[11px] text-zinc-600">
        <span>Last {Math.round((m.history.length * 5) / 60)} min</span>
        <span>Activity {m.volume.toFixed(0)} units</span>
      </div>
    </Card>
  );
}

function Quote({ label, value, cls }: { label: string; value?: number; cls: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`tabular font-mono text-sm font-medium ${cls}`}>{value === undefined ? "—" : value.toFixed(2)}</dd>
    </div>
  );
}

/* ----------------------------- order book ----------------------------- */

function BookCard({ game, itemId, onPick }: { game: GameState; itemId: ItemId; onPick: (price: number, side: Side) => void }) {
  const depth = 8;
  const asks = selectors.bookLevels(game, itemId, "sell", depth);
  const bids = selectors.bookLevels(game, itemId, "buy", depth);
  const maxCum = Math.max(1, asks[asks.length - 1]?.cum ?? 0, bids[bids.length - 1]?.cum ?? 0);
  const { bid, ask } = selectors.bestBidAsk(game, itemId);
  const spreadPct = bid && ask ? (ask - bid) / ask : undefined;

  const Row = ({ l, bookSide }: { l: ReturnType<typeof selectors.bookLevels>[number]; bookSide: Side }) => {
    const isAsk = bookSide === "sell";
    return (
      <button
        onClick={() => onPick(l.price, bookSide)}
        className="group relative grid w-full grid-cols-3 px-4 py-1 text-left font-mono text-[13px] tabular hover:bg-zinc-800/50"
        title={isAsk ? "Click to buy at this price" : "Click to sell at this price"}
      >
        <span aria-hidden className={`absolute inset-y-0 right-0 ${isAsk ? "bg-rose-500/10" : "bg-emerald-500/10"}`} style={{ width: `${(l.cum / maxCum) * 100}%` }} />
        <span className={`relative ${isAsk ? "text-rose-400" : "text-emerald-400"}`}>
          {l.price.toFixed(2)}
          {l.mine > 0 && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" title={`${l.mine} yours`} />}
        </span>
        <span className="relative text-right text-zinc-300">{fmtNum(l.qty)}</span>
        <span className="relative text-right text-zinc-500">{fmtNum(l.cum)}</span>
      </button>
    );
  };

  return (
    <Card title="Order book" icon={ListOrdered} bodyClassName="p-0">
      <div className="grid grid-cols-3 px-4 py-1.5 text-[11px] uppercase tracking-wider text-zinc-600">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      <div className="min-h-[8.5rem]">
        {[...asks].reverse().map((l) => (
          <Row key={`a${l.price}`} l={l} bookSide="sell" />
        ))}
      </div>
      <div className="flex items-center justify-between border-y border-zinc-800 bg-zinc-950/60 px-4 py-1.5 text-xs">
        <span className="tabular font-mono text-sm font-semibold text-zinc-100">{selectors.mid(game, itemId).toFixed(2)}</span>
        <span className="text-zinc-500">spread {spreadPct === undefined ? "—" : fmtPct(spreadPct, 2).replace("+", "")}</span>
      </div>
      <div className="min-h-[8.5rem] pb-1">
        {bids.map((l) => (
          <Row key={`b${l.price}`} l={l} bookSide="buy" />
        ))}
      </div>
      <p className="border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-600">
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" /> your orders · click a price to prefill a limit order
      </p>
    </Card>
  );
}

/* ------------------------------ order ticket ------------------------------ */

function TicketCard(props: {
  game: GameState;
  itemId: ItemId;
  side: Side;
  setSide: (s: Side) => void;
  kind: OrderKind;
  setKind: (k: OrderKind) => void;
  price: string;
  setPrice: (p: string) => void;
}) {
  const { game, itemId, side, setSide, kind, setKind, price, setPrice } = props;
  const placeOrder = useGameStore((s) => s.placeOrder);
  const [qtyText, setQtyText] = useState("10");

  const qty = Math.max(0, Math.floor(Number(qtyText) || 0));
  const { bid, ask } = selectors.bestBidAsk(game, itemId);
  const ref = side === "buy" ? ask : bid;
  const limitPrice = Number(price) > 0 ? Number(price) : ref ?? 0;
  const inv = game.inventory[itemId];
  const room = Math.max(0, TUNING.inventoryCap - inv);

  const est = selectors.estimateMarket(game, itemId, side, qty, TUNING.feeRate);
  const limitValue = limitPrice * qty;
  const limitFee = side === "sell" ? limitValue * TUNING.feeRate : 0;
  const crosses = kind === "limit" && ref !== undefined && (side === "buy" ? limitPrice >= ref : limitPrice <= ref);

  let error = "";
  if (qty < 1) error = "Enter a quantity.";
  else if (side === "sell" && qty > inv) error = `You only hold ${fmtNum(inv)} ${ITEMS[itemId].name}.`;
  else if (kind === "limit" && !(limitPrice > 0)) error = "Enter a limit price.";
  else if (side === "buy" && kind === "limit" && limitValue > game.balance) error = "Not enough cash for this order.";
  else if (side === "buy" && qty > room) error = `Warehouse only has room for ${fmtNum(room)} more.`;

  const maxQty = () => {
    if (side === "sell") return inv;
    const p = kind === "limit" ? limitPrice : ask ?? 0;
    return p > 0 ? Math.min(room, Math.floor(game.balance / p)) : 0;
  };

  const submit = () => {
    if (error) return;
    const res = placeOrder({ itemId, side, kind, qty, price: kind === "limit" ? limitPrice : undefined });
    if (res.ok && kind === "limit") setPrice("");
  };

  const buy = side === "buy";
  return (
    <Card title="Place order" icon={ClipboardList} bodyClassName="space-y-4">
      <SegTabs
        value={side}
        onChange={setSide}
        options={[
          { id: "buy", label: "Buy", activeClass: "bg-emerald-500/20 text-emerald-300" },
          { id: "sell", label: "Sell", activeClass: "bg-rose-500/20 text-rose-300" },
        ]}
      />
      <SegTabs value={kind} onChange={setKind} options={[{ id: "market", label: "Instant" }, { id: "limit", label: "Limit" }]} />

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
            <label htmlFor="qty">Quantity</label>
            <span>
              {side === "sell" ? `Hold ${fmtNum(inv)}` : `Cash ${fmtMoney(game.balance)}`}
            </span>
          </div>
          <input
            id="qty"
            type="number"
            min={1}
            inputMode="numeric"
            value={qtyText}
            onChange={(e) => setQtyText(e.target.value)}
            className="tabular w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-zinc-50 outline-none focus:border-zinc-600"
          />
          <div className="mt-2 flex gap-1.5">
            {[1, 10, 25, 100].map((n) => (
              <button key={n} onClick={() => setQtyText(String(n))} className="flex-1 rounded-md bg-zinc-800/70 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
                {n}
              </button>
            ))}
            <button onClick={() => setQtyText(String(maxQty()))} className="flex-1 rounded-md bg-zinc-800/70 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
              Max
            </button>
          </div>
        </div>

        {kind === "limit" && (
          <div>
            <label htmlFor="limit" className="mb-1 block text-xs text-zinc-500">
              Limit price
            </label>
            <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 px-3 focus-within:border-zinc-600">
              <span className="text-zinc-500">$</span>
              <input
                id="limit"
                type="number"
                min={0.01}
                step={0.01}
                inputMode="decimal"
                placeholder={ref !== undefined ? ref.toFixed(2) : "0.00"}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="tabular w-full bg-transparent px-2 py-2 font-mono text-zinc-50 outline-none"
              />
            </div>
            <div className="mt-2 flex gap-1.5">
              {([["Best bid", bid], ["Mid", selectors.mid(game, itemId)], ["Best ask", ask]] as const).map(([label, p]) => (
                <button key={label} onClick={() => p !== undefined && setPrice(p.toFixed(2))} className="flex-1 rounded-md bg-zinc-800/70 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* estimate */}
      <dl className="space-y-1.5 rounded-lg bg-zinc-950/60 p-3 text-sm">
        {kind === "market" ? (
          <>
            <Line label="Avg. price" value={est.filled ? `$${est.avgPrice.toFixed(2)}` : "—"} />
            {est.filled < qty && qty > 0 && <Line label="Available now" value={`${fmtNum(est.filled)} of ${fmtNum(qty)}`} warn />}
            {!buy && <Line label={`Fee (${(TUNING.feeRate * 100).toFixed(0)}%)`} value={`-${fmtMoney(est.fee)}`} />}
            <Line label={buy ? "Total cost" : "You receive"} value={fmtMoney(est.net)} strong />
          </>
        ) : (
          <>
            <Line label="Order value" value={fmtMoney(limitValue)} />
            {!buy && <Line label={`Fee (${(TUNING.feeRate * 100).toFixed(0)}%)`} value={`-${fmtMoney(limitFee)}`} />}
            <Line label={buy ? "Cash held in escrow" : "You receive if filled"} value={fmtMoney(buy ? limitValue : limitValue - limitFee)} strong />
            <p className="pt-1 text-xs text-zinc-500">
              {crosses ? "Crosses the book — fills immediately at the best prices, rest waits." : "Rests on the book until the market trades through it."}
            </p>
          </>
        )}
      </dl>

      {error && <p className="text-xs text-amber-400">{error}</p>}
      <button
        onClick={submit}
        disabled={!!error}
        className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          buy ? "bg-emerald-500 text-emerald-950 enabled:hover:bg-emerald-400" : "bg-rose-500 text-rose-950 enabled:hover:bg-rose-400"
        }`}
      >
        {buy ? "Buy" : "Sell"} {qty > 0 ? fmtNum(qty) : ""} {ITEMS[itemId].name}
        {kind === "limit" && limitPrice > 0 ? ` @ $${limitPrice.toFixed(2)}` : ""}
      </button>
    </Card>
  );
}

function Line({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={warn ? "text-amber-400" : "text-zinc-500"}>{label}</dt>
      <dd className={`tabular font-mono ${strong ? "font-semibold text-zinc-50" : warn ? "text-amber-400" : "text-zinc-300"}`}>{value}</dd>
    </div>
  );
}

/* -------------------------------- auto-sell -------------------------------- */

function AutoSellCard({ game, itemId }: { game: GameState; itemId: ItemId }) {
  const setAutoSell = useGameStore((s) => s.setAutoSell);
  const rule = game.autoSell[itemId];
  return (
    <Card
      title="Auto-sell"
      icon={Repeat}
      action={<Switch checked={rule.enabled} onChange={(enabled) => setAutoSell(itemId, { enabled })} label={`Auto-sell ${ITEMS[itemId].name}`} />}
      bodyClassName="space-y-3"
    >
      <p className="text-xs text-zinc-500">
        Every few seconds, sell stock above the amount you keep — as long as buyers pay at least your minimum. Works while you&apos;re away.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-xs text-zinc-500">Keep in stock</div>
          <NumberField label="Units to keep" value={rule.keep} onCommit={(keep) => setAutoSell(itemId, { keep })} />
        </div>
        <div>
          <div className="mb-1 text-xs text-zinc-500">Minimum price</div>
          <NumberField label="Minimum price" value={rule.minPrice} onCommit={(minPrice) => setAutoSell(itemId, { minPrice })} prefix="$" decimals={2} step={0.01} min={0.01} />
        </div>
      </div>
    </Card>
  );
}

/* ------------------------- open orders & trades ------------------------- */

function OpenOrdersCard({ game, className }: { game: GameState; className?: string }) {
  const cancel = useGameStore((s) => s.cancelOrder);
  const orders = selectors.playerOrders(game);
  return (
    <Card title="Your open orders" icon={ClipboardList} className={className} bodyClassName="p-0">
      {orders.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">No resting orders. Place a limit order and it will wait here until the market reaches your price.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-600">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-2 py-2 font-medium">Side</th>
                <th className="px-2 py-2 text-right font-medium">Price</th>
                <th className="px-2 py-2 text-right font-medium">Filled</th>
                <th className="px-2 py-2 text-right font-medium">Value</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {orders.map((o) => {
                const v = ITEM_VISUALS[o.itemId];
                const mid = selectors.mid(game, o.itemId);
                const dist = (o.price - mid) / mid;
                return (
                  <tr key={o.id}>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2 text-zinc-200">
                        <v.icon className={`h-4 w-4 ${v.text}`} aria-hidden /> {ITEMS[o.itemId].name}
                      </span>
                    </td>
                    <td className={`px-2 py-2 font-medium ${o.side === "buy" ? "text-emerald-400" : "text-rose-400"}`}>{o.side === "buy" ? "Buy" : "Sell"}</td>
                    <td className="tabular px-2 py-2 text-right font-mono text-zinc-200">
                      {o.price.toFixed(2)} <span className="text-[11px] text-zinc-600">{fmtPct(dist)}</span>
                    </td>
                    <td className="tabular px-2 py-2 text-right font-mono text-zinc-400">
                      {fmtNum(o.qty - o.remaining)}/{fmtNum(o.qty)}
                    </td>
                    <td className="tabular px-2 py-2 text-right font-mono text-zinc-300">{fmtMoney(o.price * o.remaining)}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => cancel(o.id)} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400" aria-label="Cancel order" title="Cancel order">
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TradesCard({ game, itemId }: { game: GameState; itemId: ItemId }) {
  const trades = [...game.market[itemId].trades].reverse().slice(0, 12);
  return (
    <Card title="Recent trades" icon={ListOrdered} bodyClassName="p-0">
      {trades.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">No trades yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-800/50">
          {trades.map((t, i) => (
            <li key={`${t.t}-${i}`} className="grid grid-cols-3 px-4 py-1.5 font-mono text-[13px] tabular">
              <span className={t.side === "buy" ? "text-emerald-400" : "text-rose-400"}>{t.price.toFixed(2)}</span>
              <span className="text-right text-zinc-300">{fmtNum(t.qty)}</span>
              <span className="text-right text-zinc-600">{fmtClock(t.t)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-emerald-500" : "bg-zinc-700"}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}

/** Text-backed number input that commits on blur / Enter so typing never fights re-renders. */
export function NumberField({
  value,
  onCommit,
  label,
  prefix,
  min = 0,
  step = 1,
  decimals = 0,
  className = "",
}: {
  value: number;
  onCommit: (v: number) => void;
  label: string;
  prefix?: string;
  min?: number;
  step?: number;
  decimals?: number;
  className?: string;
}) {
  const [text, setText] = useState(value.toFixed(decimals));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value.toFixed(decimals));
  }, [value, decimals, focused]);

  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && n >= min) onCommit(n);
    else setText(value.toFixed(decimals));
  };

  return (
    <label className={`flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm focus-within:border-zinc-600 ${className}`}>
      {prefix && <span className="text-zinc-500">{prefix}</span>}
      <input
        aria-label={label}
        inputMode="decimal"
        type="number"
        min={min}
        step={step}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="tabular w-full min-w-0 bg-transparent font-mono text-zinc-100 outline-none"
      />
    </label>
  );
}

export function SegTabs<T extends string>({
  value,
  onChange,
  options,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; activeClass?: string }[];
  className?: string;
}) {
  return (
    <div className={`grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-zinc-950 p-1 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={o.id === value}
          onClick={() => onChange(o.id)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            o.id === value ? (o.activeClass ?? "bg-zinc-800 text-zinc-50") : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

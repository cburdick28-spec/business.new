import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Card({
  title,
  icon: Icon,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-sm backdrop-blur ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-zinc-800/80 px-4 py-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {Icon && <Icon className="h-4 w-4 text-zinc-500" aria-hidden />}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={`p-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  valueClassName = "text-zinc-50",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-zinc-600" aria-hidden />}
      </div>
      <div className={`tabular mt-2 font-mono text-2xl font-semibold ${valueClassName}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  className = "",
  barClassName = "bg-emerald-500",
  smooth = true,
}: {
  /** 0..1 */
  value: number;
  className?: string;
  barClassName?: string;
  smooth?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-zinc-800 ${className}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${barClassName} ${smooth ? "transition-[width] duration-500 ease-linear" : ""}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

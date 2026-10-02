/** Minimal dependency-free SVG line/area chart. */
export function Sparkline({
  values,
  stroke = "#34d399",
  fill = true,
  height = 40,
  className = "",
  showBaseline = false,
}: {
  values: number[];
  stroke?: string;
  fill?: boolean;
  height?: number;
  className?: string;
  /** Draw a dashed line at the first value (useful for P&L / net worth). */
  showBaseline?: boolean;
}) {
  const w = 100;
  const h = 100;
  if (values.length < 2) return <div className={className} style={{ height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 6;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const baseY = h - pad - ((values[0] - min) / span) * (h - pad * 2);
  const gid = `g${stroke.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} style={{ height, width: "100%" }} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      {showBaseline && <line x1="0" x2={w} y1={baseY} y2={baseY} stroke="#52525b" strokeWidth="0.6" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

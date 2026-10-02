import { Star } from "lucide-react";

export function Stars({ count, size = "h-3.5 w-3.5" }: { count: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${count} star rating`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${size} ${i <= count ? "fill-amber-400 text-amber-400" : "text-zinc-700"}`} aria-hidden />
      ))}
    </span>
  );
}

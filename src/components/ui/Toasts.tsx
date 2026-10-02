"use client";

import { AlertTriangle, Check, Info, X } from "lucide-react";
import { useEffect } from "react";
import { useGameStore, type Notice } from "@/hooks/useGameState";

const STYLE: Record<Notice["tone"], { box: string; Icon: typeof Check }> = {
  good: { box: "border-emerald-500/30 bg-emerald-950/80 text-emerald-100", Icon: Check },
  bad: { box: "border-rose-500/30 bg-rose-950/80 text-rose-100", Icon: AlertTriangle },
  info: { box: "border-zinc-700 bg-zinc-900/90 text-zinc-100", Icon: Info },
};

function Toast({ notice }: { notice: Notice }) {
  const dismiss = useGameStore((s) => s.dismissNotice);
  useEffect(() => {
    const t = setTimeout(() => dismiss(notice.id), 3800);
    return () => clearTimeout(t);
  }, [notice.id, dismiss]);
  const { box, Icon } = STYLE[notice.tone];
  return (
    <div role="status" className={`pointer-events-auto flex max-w-sm animate-toast-in items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur ${box}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{notice.text}</span>
      <button onClick={() => dismiss(notice.id)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toasts() {
  const notices = useGameStore((s) => s.notices);
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex flex-col gap-2 md:bottom-4">
      {notices.map((n) => (
        <Toast key={n.id} notice={n} />
      ))}
    </div>
  );
}

"use client";

import { Terminal } from "lucide-react";
import { useState } from "react";
import { useGameStore } from "@/hooks/useGameState";

/** Discreet code-entry box for dev cheat codes (see `actions.applyCheatCode`). */
export function DevPanel() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const applyCheatCode = useGameStore((s) => s.applyCheatCode);

  function submit() {
    if (!code.trim()) return;
    applyCheatCode(code);
    setCode("");
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-zinc-800 p-2 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-200"
        aria-label="Dev code"
        title="Dev code"
      >
        <Terminal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-2 shadow-lg">
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="code"
            className="w-28 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200 outline-none focus:border-zinc-600"
          />
          <button
            onClick={submit}
            className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            Go
          </button>
        </div>
      )}
    </div>
  );
}

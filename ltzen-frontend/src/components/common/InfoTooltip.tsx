"use client";

import { useState } from "react";

/**
 * Minimal accessible info tooltip (ⓘ). Hover + focus + click-toggle so it's keyboard
 * reachable (a11y baseline, uiux §10). Color is not the only signal.
 */
export function InfoTooltip({ text, label = "More info" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] leading-none text-zinc-400 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-green"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-6 z-30 w-56 -translate-x-1/2 rounded-lg border border-white/[0.12] bg-[#0D1117] px-3 py-2 text-xs leading-relaxed text-zinc-200 shadow-lg shadow-black/40"
        >
          {text}
        </span>
      )}
    </span>
  );
}

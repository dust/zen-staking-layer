"use client";

import { useState } from "react";
import { copy } from "@/lib/copy";

/**
 * CopyButton — copies `value` to the clipboard and flips to a confirmed state for ~1.5s.
 * a11y (uiux §10): state is conveyed by both icon AND text, not color alone; the button has an
 * explicit aria-label and is fully keyboard-reachable.
 */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure context / permissions); fail silently — the value
      // is still visible and linked to the explorer, so copy is a convenience, not the only path.
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={`${copied ? copy.transparency.copied : copy.transparency.copy}${label ? ` ${label}` : ""}`}
      className="inline-flex min-h-9 items-center gap-1 rounded-md border border-white/[0.12] px-2 py-1 text-xs text-zinc-300 transition-colors hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green"
    >
      <span aria-hidden>{copied ? "✓" : "⧉"}</span>
      {copied ? copy.transparency.copied : copy.transparency.copy}
    </button>
  );
}

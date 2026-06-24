"use client";

/**
 * TxBadge — header indicator for in-flight transactions (uiux §8.1: "顶栏显示进行中 tx 数").
 * Reads the pending-toast count; renders nothing when idle so it doesn't clutter the bar.
 */

import { useToast } from "@/components/common/Toast";
import { copy } from "@/lib/copy";

export function TxBadge() {
  const { pendingCount } = useToast();
  if (pendingCount === 0) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-100"
      title={`${pendingCount} ${copy.tx.inFlight}`}
    >
      <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />
      {pendingCount} {copy.tx.inFlight}
    </span>
  );
}

"use client";

import { copy } from "@/lib/copy";
import { Card } from "@/components/common/Card";

/**
 * HarvestHistory (uiux §7) — placeholder until the Goldsky indexer is live (frontend-plan §M4).
 * Will list `Harvested` events (time / claimed / restake / post-harvest rate). The copy is
 * honest about the empty state and reiterates the rate-neutral invariant (tone-guide §7).
 */
export function HarvestHistory() {
  return (
    <Card>
      <h2 className="font-display text-sm font-semibold tracking-tight text-white">{copy.transparency.harvestHeading}</h2>
      <div className="mt-4 rounded-lg border border-dashed border-white/10 bg-white/[0.01] px-4 py-8 text-center">
        <p className="mx-auto max-w-md text-sm text-zinc-400">
          {copy.transparency.harvestPlaceholder}
        </p>
      </div>
    </Card>
  );
}

"use client";

/**
 * Placeholder for M5 ltZEN OFT bridge. Cross-chain ZEN stake: `/stake-crosschain`.
 * Redeem to Base: `/redeem-to-base`.
 */

import Link from "next/link";
import { Card } from "@/components/common/Card";
import { copy } from "@/lib/copy";

export default function BridgePlaceholderPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <Card className="max-w-xl">
        <h1 className="font-display text-xl font-bold tracking-tight text-white">Bridge ltZEN</h1>
        <p className="mt-2 text-sm text-zinc-400">
          The dedicated Horizen ⇄ Base ltZEN OFT bridge UI is not available in this build yet.
        </p>
        <p className="mt-3 text-sm text-zinc-400">
          Stake ZEN from Base into stLighter, or redeem ltZEN out to Base ZEN:
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/stake-crosschain"
            className="inline-flex items-center rounded-xl bg-brand-cta px-4 py-2 text-sm font-semibold text-black transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
          >
            {copy.crossStake.title} →
          </Link>
          <Link
            href="/redeem-to-base"
            className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
          >
            {copy.redeemToBase.title} →
          </Link>
        </div>
      </Card>
    </div>
  );
}

"use client";

/**
 * ChainGuide — renders the chain-aware guidance for a Horizen-only action when the user is on the
 * wrong network (uiux §6.1 / §5.2). It never hard-errors: it explains and offers the one-click
 * remedy (switch chain, bridge, or Stake from Base). Returns null when the action is available.
 */

import Link from "next/link";
import { useChainId, useSwitchChain } from "wagmi";
import { HUB_CHAIN_ID, SPOKE_CHAIN_ID } from "@/config/chains";
import { getAvailability } from "@/lib/chainGating";
import type { AppAction } from "@/lib/chainGating";
import { copy } from "@/lib/copy";
import { Card } from "./Card";

export function ChainGuide({ action }: { action: AppAction }) {
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const availability = getAvailability(action, chainId);

  if (availability.status === "available") return null;

  const reason =
    availability.status === "guide-bridge" ||
    availability.status === "guide-switch-chain" ||
    availability.status === "guide-cross-stake"
      ? availability.reason
      : copy.errors.wrongChain;

  return (
    <Card className="border-amber-400/20 bg-amber-400/[0.04]">
      <p className="text-sm text-amber-100/90">{reason}</p>

      <div className="mt-4 flex flex-wrap gap-3">
        {availability.status === "guide-bridge" ? (
          <Link
            href="/bridge"
            className="inline-flex items-center rounded-xl bg-brand-cta px-4 py-2 text-sm font-semibold text-black transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
          >
            Bridge back to Horizen →
          </Link>
        ) : null}

        {availability.status === "guide-cross-stake" ? (
          <>
            <Link
              href="/stake-crosschain"
              className="inline-flex items-center rounded-xl bg-brand-cta px-4 py-2 text-sm font-semibold text-black transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
            >
              {copy.crossStake.title} →
            </Link>
            <button
              type="button"
              disabled={isPending}
              onClick={() => switchChain({ chainId: HUB_CHAIN_ID })}
              className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 transition-colors hover:bg-white/10 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
            >
              {copy.cta.switchToHorizen}
            </button>
          </>
        ) : null}

        {availability.status === "guide-switch-chain" ||
        availability.status === "wrong-network" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => switchChain({ chainId: availability.switchTo })}
            className="inline-flex items-center rounded-xl bg-brand-cta px-4 py-2 text-sm font-semibold text-black transition-[filter] hover:brightness-110 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
          >
            {availability.switchTo === SPOKE_CHAIN_ID
              ? copy.crossStake.switchToBase
              : copy.cta.switchToHorizen}
          </button>
        ) : null}
      </div>
    </Card>
  );
}

"use client";

/**
 * ChainGuide — renders the chain-aware guidance for a Horizen-only action when the user is on the
 * wrong network (uiux §6.1 / §5.2). It never hard-errors: it explains and offers the one-click
 * remedy (switch to Horizen, or — for redeem on Base — a bridge link). Returns null when the
 * action is actually available, so callers can early-out:
 *
 *   const guide = <ChainGuide action="deposit" />;
 *   if (!isActionAvailable("deposit", chainId)) return guide;
 */

import Link from "next/link";
import { useChainId, useSwitchChain } from "wagmi";
import { getAvailability } from "@/lib/chainGating";
import type { AppAction } from "@/lib/chainGating";
import { copy } from "@/lib/copy";
import { Card } from "./Card";

export function ChainGuide({ action }: { action: AppAction }) {
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const availability = getAvailability(action, chainId);

  if (availability.status === "available") return null;

  return (
    <Card className="border-amber-400/20 bg-amber-400/[0.04]">
      <p className="text-sm text-amber-100/90">
        {availability.status === "guide-bridge"
          ? availability.reason
          : availability.status === "guide-switch-chain"
            ? availability.reason
            : copy.errors.wrongChain}
      </p>

      <div className="mt-4">
        {availability.status === "guide-bridge" ? (
          <Link
            href="/bridge"
            className="inline-flex items-center rounded-xl bg-brand-cta px-4 py-2 text-sm font-semibold text-black transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
          >
            Bridge back to Horizen →
          </Link>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              switchChain({
                chainId:
                  availability.status === "guide-switch-chain" || availability.status === "wrong-network"
                    ? availability.switchTo
                    : chainId!,
              })
            }
            className="inline-flex items-center rounded-xl bg-brand-cta px-4 py-2 text-sm font-semibold text-black transition-[filter] hover:brightness-110 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
          >
            {copy.cta.switchToHorizen}
          </button>
        )}
      </div>
    </Card>
  );
}

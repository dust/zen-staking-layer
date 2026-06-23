"use client";

import { usePosition } from "@/hooks/usePosition";
import { approx, formatShares, formatZenAmount } from "@/lib/format";
import { copy } from "@/lib/copy";
import { Card } from "@/components/common/Card";
import { Skeleton } from "@/components/common/Skeleton";
import { InfoTooltip } from "@/components/common/InfoTooltip";
import { WalletButton } from "@/components/layout/WalletButton";

/**
 * PositionCard (uiux §3.2 / §0.1). Headline number is ZEN VALUE (= shares × Horizen rate),
 * prefixed `≈` because it's derived. Raw ltZEN shares are secondary/gray and never the headline.
 * Disconnected → connect prompt (personal data needs a wallet; §8.4).
 */
export function PositionCard() {
  const { shares, zenValue, isConnected, isLoading, isConfigured } = usePosition();

  if (!isConnected) {
    return (
      <Card>
        <div className="flex items-center gap-1 text-sm font-medium text-zinc-400">
          {copy.labels.yourBalance}
        </div>
        <p className="mt-3 text-sm text-zinc-400">{copy.states.connectToView}</p>
        <div className="mt-4">
          <WalletButton />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-1 text-sm font-medium text-zinc-400">
        {copy.labels.yourBalance}
        <InfoTooltip text={copy.tooltips.yourBalance} />
      </div>

      <div className="mt-2 font-mono text-3xl font-semibold text-white tabular-nums">
        {!isConfigured ? (
          <span className="text-lg text-zinc-500">{copy.states.notConfigured}</span>
        ) : isLoading || zenValue === undefined ? (
          <Skeleton className="h-9 w-48" />
        ) : (
          approx(formatZenAmount(zenValue, 4))
        )}
      </div>

      <div className="mt-2 flex items-center gap-1 text-sm text-zinc-500">
        {isConfigured && shares !== undefined ? (
          <span className="font-mono tabular-nums">{formatShares(shares)}</span>
        ) : null}
        <InfoTooltip text={copy.tooltips.ltZenShares} label="About ltZEN shares" />
      </div>
    </Card>
  );
}

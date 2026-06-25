"use client";

import { useProtocolStats } from "@/hooks/useProtocolStats";
import { formatShares, formatZenAmount } from "@/lib/format";
import { copy } from "@/lib/copy";
import { Card } from "@/components/common/Card";
import { Skeleton } from "@/components/common/Skeleton";
import { InfoTooltip } from "@/components/common/InfoTooltip";

/**
 * ProtocolStatsCard (uiux §3.4). Public, no wallet needed. Shows TVL (totalAssets in ZEN) and
 * issued ltZEN shares. The raw rewardPerToken accumulator lives on the Transparency page, not
 * here (M4).
 */
export function ProtocolStatsCard() {
  const { totalAssets, issuedShares, isLoading, isError, isConfigured } =
    useProtocolStats();

  return (
    <Card>
      <h2 className="font-display text-sm font-semibold tracking-tight text-white">Protocol</h2>

      <dl className="mt-3 space-y-4">
        <Stat
          label={copy.labels.totalStaked}
          loading={isLoading}
          error={isError}
          configured={isConfigured}
          value={totalAssets !== undefined ? formatZenAmount(totalAssets, 2) : undefined}
        />
        <Stat
          label={copy.labels.ltZenShares}
          tooltip={copy.tooltips.ltZenShares}
          loading={isLoading}
          error={isError}
          configured={isConfigured}
          value={issuedShares !== undefined ? formatShares(issuedShares) : undefined}
        />
      </dl>
    </Card>
  );
}

function Stat({
  label,
  value,
  tooltip,
  loading,
  error,
  configured,
}: {
  label: string;
  value: string | undefined;
  tooltip?: string;
  loading: boolean;
  error: boolean;
  configured: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1 text-sm text-zinc-400">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </dt>
      <dd className="font-mono text-sm font-medium text-white tabular-nums">
        {!configured ? (
          <span className="text-zinc-500">—</span>
        ) : error ? (
          <span className="text-zinc-500">{copy.cta.retry}</span>
        ) : loading || value === undefined ? (
          <Skeleton className="h-4 w-24" />
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

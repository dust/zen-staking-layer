"use client";

import { useTransparency } from "@/hooks/useTransparency";
import { addressUrl } from "@/lib/explorer";
import { horizenAddress } from "@/config/contracts";
import { copy } from "@/lib/copy";
import { Card } from "@/components/common/Card";
import { Skeleton } from "@/components/common/Skeleton";
import { InfoTooltip } from "@/components/common/InfoTooltip";

/**
 * RawMetricsTable (uiux §7) — on-chain metrics shown RAW (wei, 1e36 accumulator, bps) so an
 * auditor can verify each against the source contract. Each row links to the contract that
 * exposes it on the explorer. Values are presented exactly as read — no rounding, no scaling.
 */
export function RawMetricsTable() {
  const m = useTransparency();
  const l = copy.transparency.metricLabels;
  const h = copy.transparency.metricHints;

  const stLighter = horizenAddress("stLighter");
  const zenStaker = horizenAddress("zenStaker");
  const ltZEN = horizenAddress("ltZEN");

  const rows: MetricRow[] = [
    {
      label: l.rewardPerToken,
      hint: h.rewardPerToken,
      value: m.rewardPerToken?.toString(),
      href: zenStaker ? addressUrl(zenStaker) : undefined,
    },
    {
      label: l.totalAssets,
      hint: h.totalAssets,
      value: m.totalAssets?.toString(),
      href: stLighter ? addressUrl(stLighter) : undefined,
    },
    {
      label: l.issuedShares,
      hint: h.issuedShares,
      value: m.issuedShares?.toString(),
      href: stLighter ? addressUrl(stLighter) : undefined,
    },
    {
      label: l.feeBps,
      hint: h.feeBps,
      value: m.feeBps !== undefined ? `${m.feeBps.toString()} bps` : undefined,
      href: stLighter ? addressUrl(stLighter) : undefined,
    },
    {
      label: l.paused,
      hint: h.paused,
      // a11y §10: color is never the only signal — pair an icon + the literal word.
      value:
        m.paused === undefined
          ? undefined
          : m.paused
            ? `⚠ ${copy.transparency.paused.yes}`
            : `● ${copy.transparency.paused.no}`,
      tone: m.paused ? "warn" : "ok",
      href: stLighter ? addressUrl(stLighter) : undefined,
    },
    {
      label: l.implementation,
      hint: h.implementation,
      value: m.implementation,
      mono: true,
      href: m.implementation ? addressUrl(m.implementation) : undefined,
    },
    {
      label: l.minter,
      hint: h.minter,
      value: m.minter,
      mono: true,
      href: ltZEN ? addressUrl(ltZEN) : undefined,
    },
  ];

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-white">{copy.transparency.metricsHeading}</h2>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{copy.transparency.metricsNote}</p>

      <dl className="mt-4 divide-y divide-white/5">
        {rows.map((row) => (
          <Row key={row.label} row={row} loading={m.isLoading} error={m.isError} />
        ))}
      </dl>
    </Card>
  );
}

type MetricRow = {
  label: string;
  hint: string;
  value: string | undefined;
  href?: string;
  mono?: boolean;
  tone?: "ok" | "warn";
};

function Row({
  row,
  loading,
  error,
}: {
  row: MetricRow;
  loading: boolean;
  error: boolean;
}) {
  const toneClass =
    row.tone === "warn" ? "text-amber-300" : row.tone === "ok" ? "text-emerald-300" : "text-white";

  const content =
    error && row.value === undefined ? (
      <span className="text-zinc-500">{copy.states.loadError}</span>
    ) : loading && row.value === undefined ? (
      <Skeleton className="h-4 w-32" />
    ) : row.value === undefined ? (
      <span className="text-zinc-500">—</span>
    ) : row.href ? (
      <a
        href={row.href}
        target="_blank"
        rel="noopener noreferrer"
        title={copy.transparency.openExplorer}
        className={`break-all rounded transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${toneClass} ${row.mono ? "font-mono text-xs" : ""}`}
      >
        {row.value} <span aria-hidden>↗</span>
      </a>
    ) : (
      <span className={`break-all ${toneClass} ${row.mono ? "font-mono text-xs" : ""}`}>
        {row.value}
      </span>
    );

  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <dt className="flex items-center gap-1 text-sm text-zinc-400 sm:pt-0.5">
        {row.label}
        <InfoTooltip text={row.hint} />
      </dt>
      <dd className="text-sm tabular-nums sm:max-w-[60%] sm:text-right">{content}</dd>
    </div>
  );
}

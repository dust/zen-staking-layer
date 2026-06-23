"use client";

import { useExchangeRate } from "@/hooks/useExchangeRate";
import { formatRate } from "@/lib/format";
import { copy } from "@/lib/copy";
import { Skeleton } from "@/components/common/Skeleton";
import { InfoTooltip } from "@/components/common/InfoTooltip";

/**
 * HeroRate — the protagonist metric (design §0/§3.1). `1 ltZEN = X ZEN` at 8 decimals so the
 * per-block live rise is visible. The number only climbs smoothly; harvest is rate-neutral so
 * there is deliberately NO special jump treatment (design §0 hard rule).
 *
 * Tabular figures keep width stable; the last digits are emphasized to convey "live". Motion is
 * limited to a subtle pulse and is disabled under prefers-reduced-motion (handled by Tailwind's
 * motion-reduce variant).
 */
export function HeroRate() {
  const { rate, isLoading, isError, isConfigured } = useExchangeRate();

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 p-8">
      <div className="flex items-center gap-1 text-sm font-medium text-zinc-400">
        {copy.labels.exchangeRate}
        <InfoTooltip text={copy.tooltips.exchangeRate} />
      </div>

      <div className="mt-3 font-mono text-4xl font-semibold tracking-tight text-white tabular-nums sm:text-5xl">
        {!isConfigured ? (
          <span className="text-2xl text-zinc-500">{copy.states.notConfigured}</span>
        ) : isError ? (
          <span className="text-2xl text-zinc-500">{copy.states.loadError}</span>
        ) : isLoading || rate === undefined ? (
          <Skeleton className="h-12 w-72" />
        ) : (
          <RateValue value={formatRate(rate, 8)} />
        )}
      </div>

      <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
        {copy.brand.tagline}
      </p>
    </section>
  );
}

function RateValue({ value }: { value: string }) {
  // Split so the trailing digits (where movement shows) can be emphasized.
  const head = value.slice(0, -3);
  const tail = value.slice(-3);
  return (
    <span aria-label={`1 ltZEN equals ${value} ZEN`}>
      <span className="text-zinc-300">1 ltZEN = </span>
      <span>{head}</span>
      <span className="text-emerald-300 motion-safe:animate-pulse">{tail}</span>
      <span className="ml-2 text-2xl text-zinc-400">ZEN</span>
    </span>
  );
}

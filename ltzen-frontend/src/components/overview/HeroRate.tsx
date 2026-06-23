"use client";

import { useExchangeRate } from "@/hooks/useExchangeRate";
import { formatRate } from "@/lib/format";
import { copy } from "@/lib/copy";
import { HERO_RATE_UNITS } from "@/config/display";
import { Skeleton } from "@/components/common/Skeleton";
import { InfoTooltip } from "@/components/common/InfoTooltip";

/**
 * HeroRate — the protagonist metric (design §0/§3.1). The vault's DECIMALS_OFFSET=3 puts
 * `convertToAssets(1e18)` near 0.001, where per-block movement is hard to see. We quote the
 * value of N ltZEN (HERO_RATE_UNITS, default 1000) so the headline sits near 1.0 and the
 * trailing digits move visibly. The label states the unit honestly — we scale the QUANTITY,
 * never fake "1 ltZEN = <scaled>" (tone-guide: don't mislead).
 *
 * The number only climbs smoothly; harvest is rate-neutral so there is deliberately NO special
 * jump treatment (design §0 hard rule). Tabular figures keep width stable; the last digits are
 * emphasized to convey "live". Motion is disabled under prefers-reduced-motion.
 */
const unitsLabel = HERO_RATE_UNITS.toLocaleString("en-US");

export function HeroRate() {
  const { rate, isLoading, isError, isConfigured } = useExchangeRate();
  const scaled = rate !== undefined ? rate * BigInt(HERO_RATE_UNITS) : undefined;

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
        ) : isLoading || scaled === undefined ? (
          <Skeleton className="h-12 w-72" />
        ) : (
          <RateValue value={formatRate(scaled, 8)} />
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
    <span aria-label={`${unitsLabel} ltZEN equals ${value} ZEN`}>
      <span className="text-zinc-300">{unitsLabel} ltZEN = </span>
      <span>{head}</span>
      <span className="text-emerald-300 motion-safe:animate-pulse">{tail}</span>
      <span className="ml-2 text-2xl text-zinc-400">ZEN</span>
    </span>
  );
}

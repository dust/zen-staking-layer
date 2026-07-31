"use client";

import { useCallback, useId, useState, type MouseEvent } from "react";
import { useRateHistory, type RatePoint } from "@/hooks/useRateHistory";
import { copy } from "@/lib/copy";
import { Card } from "@/components/common/Card";
import { formatRate } from "@/lib/format";
import { HERO_RATE_UNITS } from "@/config/display";

/**
 * CompoundChart (design §2/§4, uiux §3.3). Plots convertToAssets history from Goldsky
 * rateSnapshots when configured; otherwise session-sampled points.
 *
 * Rules honored:
 *   - < 2 points → "accumulating" message, NOT a misleading straight line (uiux §3.3).
 *   - The line is smooth and only rises; harvest is never drawn as a vertical step (design §0).
 *   - Harvest markers + the dashed "no-compound" comparison line are STUBBED for later.
 *
 * Hover shows the nearest RatePoint as human-readable time + rate (same unit scale as HeroRate).
 */
export function CompoundChart() {
  const { points, hasEnoughData, status, source } = useRateHistory();

  const note =
    source === "subgraph" && status === "ready"
      ? copy.states.eventHistoryNote
      : status === "error"
        ? copy.states.loadError
        : copy.states.sessionSampleNote;

  const body =
    status === "loading" && source === "subgraph" && !hasEnoughData ? (
      <div className="flex h-full items-center justify-center text-center text-sm text-zinc-500">
        {copy.states.chartAccumulating}
      </div>
    ) : hasEnoughData ? (
      <Sparkline points={points} historical={source === "subgraph"} />
    ) : (
      <div className="flex h-full items-center justify-center text-center text-sm text-zinc-500">
        {copy.states.chartAccumulating}
      </div>
    );

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold tracking-tight text-white">Compounding</h2>
        <span className="text-xs text-zinc-500">{note}</span>
      </div>

      <div className="mt-4 h-40">{body}</div>

      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        {copy.microcopy.compounding}
      </p>
    </Card>
  );
}

const unitsLabel = HERO_RATE_UNITS.toLocaleString("en-US");

function formatPointTime(tMs: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(tMs));
  } catch {
    return new Date(tMs).toISOString();
  }
}

/** Match HeroRate: quote N ltZEN so the number sits near 1.0 with DECIMALS_OFFSET=3. */
function formatPointRate(rateWei: string): string {
  try {
    const scaled = BigInt(rateWei) * BigInt(HERO_RATE_UNITS);
    return `${unitsLabel} ltZEN = ${formatRate(scaled, 8)} ZEN`;
  } catch {
    return rateWei;
  }
}

function Sparkline({
  points,
  historical,
}: {
  points: RatePoint[];
  historical: boolean;
}) {
  const gradId = useId().replace(/:/g, "");
  const values = points.map((p) => Number(p.rate) / 1e18);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 600;
  const H = 160;
  const PAD = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const xy = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
    return [x, y] as const;
  });

  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;

  const onMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || points.length < 2) return;
      const x = (e.clientX - rect.left) / rect.width;
      const idx = Math.round(x * (points.length - 1));
      setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
    },
    [points.length],
  );

  const hover = hoverIdx !== null ? points[hoverIdx] : null;
  const hoverXy = hoverIdx !== null ? xy[hoverIdx] : null;
  // Map SVG x to CSS % so the marker tracks under preserveAspectRatio=none stretch.
  const markerLeft =
    hoverXy !== null ? `${((hoverXy[0] - PAD) / (W - PAD * 2)) * 100}%` : undefined;

  return (
    <div
      className="relative h-full w-full"
      onMouseMove={onMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label={
          historical
            ? "Exchange rate over indexed on-chain events — trending up as rewards compound."
            : "Exchange rate over this session — trending up as rewards compound."
        }
      >
        <defs>
          <linearGradient id={`${gradId}-line`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#27e4c0" />
            <stop offset="55%" stopColor="#31e0b5" />
            <stop offset="100%" stopColor="#3454ee" />
          </linearGradient>
          <linearGradient id={`${gradId}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#31e0b5" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#31e0b5" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gradId}-area)`} stroke="none" />
        <polyline
          points={line}
          fill="none"
          stroke={`url(#${gradId}-line)`}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {hover && hoverXy && markerLeft !== undefined ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/25"
            style={{ left: markerLeft }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0D1117] bg-brand-teal"
            style={{
              left: markerLeft,
              top: `${(hoverXy[1] / H) * 100}%`,
            }}
          />
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 max-w-[min(100%,16rem)] -translate-x-1/2 rounded-lg border border-white/10 bg-[#12161e]/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-sm"
            style={{
              left: markerLeft,
              top: Math.max(0, (hoverXy[1] / H) * 100 - 18),
              transform:
                hoverIdx !== null && hoverIdx > points.length * 0.7
                  ? "translate(-90%, -100%)"
                  : hoverIdx !== null && hoverIdx < points.length * 0.3
                    ? "translate(-10%, -100%)"
                    : "translate(-50%, -100%)",
            }}
          >
            <div className="text-zinc-400">{formatPointTime(hover.t)}</div>
            <div className="mt-0.5 font-mono tabular-nums text-white">
              {formatPointRate(hover.rate)}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

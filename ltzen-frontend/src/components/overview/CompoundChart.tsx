"use client";

import { useRateHistory } from "@/hooks/useRateHistory";
import { copy } from "@/lib/copy";
import { Card } from "@/components/common/Card";

/**
 * CompoundChart (design §2/§4, uiux §3.3). Plots convertToAssets history from Goldsky
 * rateSnapshots when configured; otherwise session-sampled points.
 *
 * Rules honored:
 *   - < 2 points → "accumulating" message, NOT a misleading straight line (uiux §3.3).
 *   - The line is smooth and only rises; harvest is never drawn as a vertical step (design §0).
 *   - Harvest markers + the dashed "no-compound" comparison line are STUBBED for later.
 *
 * Rendered as an inline SVG sparkline to avoid pulling in a chart dependency at this stage.
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
      <Sparkline
        values={points.map((p) => Number(p.rate) / 1e18)}
        historical={source === "subgraph"}
      />
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

function Sparkline({
  values,
  historical,
}: {
  values: number[];
  historical: boolean;
}) {
  const W = 600;
  const H = 160;
  const PAD = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1; // avoid /0 when all samples equal

  const xy = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
    return [x, y] as const;
  });

  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;

  return (
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
        <linearGradient id="compound-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#27e4c0" />
          <stop offset="55%" stopColor="#31e0b5" />
          <stop offset="100%" stopColor="#3454ee" />
        </linearGradient>
        <linearGradient id="compound-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#31e0b5" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#31e0b5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#compound-area)" stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke="url(#compound-line)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

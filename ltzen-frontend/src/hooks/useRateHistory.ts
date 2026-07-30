"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useExchangeRate } from "./useExchangeRate";
import {
  isSubgraphConfigured,
  subgraphQuery,
  type SubgraphStatus,
} from "@/lib/subgraph";

/**
 * Exchange-rate history for CompoundChart (frontend-plan §M1 / §7; uiux §3.3).
 *
 * Prefer Goldsky `rateSnapshots` when NEXT_PUBLIC_SUBGRAPH_URL is set. Fall back to
 * session-localStorage sampling of `convertToAssets(1e18)` so Overview still works
 * without the indexer (dev / misconfigured env).
 */

export type RatePoint = { t: number; rate: string }; // rate as decimal string to stay JSON-safe

export type RateHistorySource = "subgraph" | "session";

const STORAGE_KEY = "ltzen.rateHistory.v1";
const MAX_POINTS = 500;
const MIN_GAP_MS = 10_000;
const RATE_QUERY_FIRST = 200;
const REFETCH_MS = 60_000;

const RATE_HISTORY_QUERY = /* GraphQL */ `
  query RateHistory($first: Int!) {
    rateSnapshots(first: $first, orderBy: blockTimestamp, orderDirection: asc) {
      blockTimestamp
      rate
      trigger
    }
  }
`;

type RateSnapshotRow = {
  blockTimestamp: string;
  rate: string;
  trigger: string;
};

type RateHistoryData = {
  rateSnapshots: RateSnapshotRow[];
};

/** Keep last snapshot per blockTimestamp (same block often has harvest+deposit). */
function dedupeByTimestamp(rows: RateSnapshotRow[]): RatePoint[] {
  const byTs = new Map<string, RatePoint>();
  for (const row of rows) {
    byTs.set(row.blockTimestamp, {
      t: Number(row.blockTimestamp) * 1000,
      rate: row.rate,
    });
  }
  return [...byTs.values()].sort((a, b) => a.t - b.t);
}

function readStorage(): RatePoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RatePoint[]) : [];
  } catch {
    return [];
  }
}

const rateStore = (() => {
  let points: RatePoint[] = [];
  let hydrated = false;
  const listeners = new Set<() => void>();

  function emit() {
    for (const l of listeners) l();
  }

  return {
    hydrate() {
      if (hydrated) return;
      hydrated = true;
      points = readStorage();
      emit();
    },
    add(rateWei: bigint) {
      const rate = rateWei.toString();
      const last = points[points.length - 1];
      const now = Date.now();
      if (last && now - last.t < MIN_GAP_MS && last.rate === rate) return;
      points = [...points, { t: now, rate }].slice(-MAX_POINTS);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(points));
      } catch {
        // storage full / unavailable — non-fatal
      }
      emit();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return points;
    },
  };
})();

const EMPTY: RatePoint[] = [];

function useSessionRateHistory(): {
  points: RatePoint[];
  hasEnoughData: boolean;
} {
  const { rate } = useExchangeRate();

  const points = useSyncExternalStore(
    rateStore.subscribe,
    rateStore.getSnapshot,
    () => EMPTY,
  );

  useEffect(() => {
    rateStore.hydrate();
  }, []);

  useEffect(() => {
    if (rate !== undefined) rateStore.add(rate);
  }, [rate]);

  return {
    points,
    hasEnoughData: points.length >= 2,
  };
}

function useSubgraphRateHistory(): {
  points: RatePoint[];
  hasEnoughData: boolean;
  status: SubgraphStatus;
} {
  const configured = isSubgraphConfigured();
  const [points, setPoints] = useState<RatePoint[]>(EMPTY);
  const [status, setStatus] = useState<SubgraphStatus>(
    configured ? "loading" : "disabled",
  );

  useEffect(() => {
    if (!configured) {
      setStatus("disabled");
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const data = await subgraphQuery<RateHistoryData>(RATE_HISTORY_QUERY, {
          first: RATE_QUERY_FIRST,
        });
        if (cancelled) return;
        setPoints(dedupeByTimestamp(data.rateSnapshots));
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    }

    void load();
    const id = window.setInterval(() => void load(), REFETCH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [configured]);

  return {
    points,
    hasEnoughData: points.length >= 2,
    status,
  };
}

export function useRateHistory(): {
  points: RatePoint[];
  hasEnoughData: boolean;
  status: SubgraphStatus;
  source: RateHistorySource;
} {
  const configured = isSubgraphConfigured();
  const session = useSessionRateHistory();
  const subgraph = useSubgraphRateHistory();

  // Hooks must run unconditionally; pick source after both run.
  if (!configured) {
    return {
      points: session.points,
      hasEnoughData: session.hasEnoughData,
      status: "disabled",
      source: "session",
    };
  }

  // Subgraph error with no points yet → fall back to session sampling.
  if (subgraph.status === "error" && subgraph.points.length === 0) {
    return {
      points: session.points,
      hasEnoughData: session.hasEnoughData,
      status: "error",
      source: "session",
    };
  }

  return {
    points: subgraph.points,
    hasEnoughData: subgraph.hasEnoughData,
    status: subgraph.status,
    source: "subgraph",
  };
}

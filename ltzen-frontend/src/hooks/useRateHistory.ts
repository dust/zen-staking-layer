"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useExchangeRate } from "./useExchangeRate";

/**
 * Session-only exchange-rate sampling for the CompoundChart (frontend-plan §M1 / §7; uiux §3.3).
 *
 * The chain stores no historical rate, and there's no subgraph yet, so the first version just
 * samples `convertToAssets(1e18)` as the user watches and keeps the series in localStorage.
 * This is explicitly "sampled this session" data — real history waits for Goldsky (§6).
 *
 * Implemented as a module-level external store so the sampling effect only calls `store.add()`
 * (never setState-in-effect), and components subscribe via useSyncExternalStore.
 */

export type RatePoint = { t: number; rate: string }; // rate as decimal string to stay JSON-safe

const STORAGE_KEY = "ltzen.rateHistory.v1";
const MAX_POINTS = 500;
const MIN_GAP_MS = 10_000; // don't store more often than every 10s

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
        // storage full / unavailable — non-fatal, chart just won't persist
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

export function useRateHistory() {
  const { rate } = useExchangeRate();

  const points = useSyncExternalStore(
    rateStore.subscribe,
    rateStore.getSnapshot,
    () => EMPTY, // server snapshot (no localStorage during SSR)
  );

  useEffect(() => {
    rateStore.hydrate();
  }, []);

  useEffect(() => {
    if (rate !== undefined) rateStore.add(rate);
  }, [rate]);

  return {
    points,
    /** < 2 points → caller shows the "accumulating" state, not a line (uiux §3.3). */
    hasEnoughData: points.length >= 2,
  };
}

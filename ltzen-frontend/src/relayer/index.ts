/**
 * Relayer selector (frontend-plan §2). Picks the concrete relayer at call time: a real
 * HttpRelayer when endpoints are configured (`NEXT_PUBLIC_RELAYER_ENDPOINTS`), otherwise the
 * MockRelayer so the gasless UX is exercisable in dev. The first endpoint wins for now; a
 * future multi-endpoint strategy (health/latency pick) would live here only.
 */

import { hasRelayer, relayerEndpoints } from "@/config/relayer";
import { HttpRelayer } from "./httpRelayer";
import { MockRelayer } from "./mockRelayer";
import type { Relayer } from "./types";

export * from "./types";

let cached: Relayer | undefined;

export function getRelayer(): Relayer {
  if (cached) return cached;
  cached = hasRelayer ? new HttpRelayer(relayerEndpoints[0]) : new MockRelayer();
  return cached;
}

/** Whether gasless is offered at all (real relayer OR dev mock). Mock is dev-only. */
export const gaslessSupported = hasRelayer || process.env.NODE_ENV !== "production";

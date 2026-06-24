/**
 * Relayer selector (frontend-plan §2).
 *
 *   - HttpRelayer when `NEXT_PUBLIC_RELAYER_ENDPOINTS` is set (future production relayer).
 *   - MockRelayer when `NEXT_PUBLIC_MOCK_RELAYER_ONLY=1` (UI lifecycle / timeout testing).
 *   - DirectContractRelayer otherwise (M2 testnet: real on-chain depositWithSigAndPermit, no
 *     separate approve; user confirms one broadcast tx until a relayer backend exists).
 */

import type { Config } from "wagmi";
import { hasRelayer, relayerEndpoints, useMockRelayerOnly } from "@/config/relayer";
import { DirectContractRelayer } from "./directContractRelayer";
import { HttpRelayer } from "./httpRelayer";
import { MockRelayer } from "./mockRelayer";
import type { Relayer } from "./types";

export * from "./types";

/** Gasless is available in dev/testnet (direct submit) or when a relayer endpoint is configured. */
export const gaslessSupported =
  hasRelayer || useMockRelayerOnly || process.env.NODE_ENV !== "production";

export function createRelayer(config: Config): Relayer {
  if (hasRelayer) return new HttpRelayer(relayerEndpoints[0]);
  if (useMockRelayerOnly) return new MockRelayer();
  return new DirectContractRelayer(config);
}

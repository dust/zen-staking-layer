"use client";

import { useReadContract } from "wagmi";
import { abis, horizenAddress } from "@/config/contracts";
import { HUB_CHAIN_ID } from "@/config/chains";

const ONE_LTZEN = 10n ** 18n;

/**
 * Exchange rate = `convertToAssets(1e18)` on Horizen (uiux §3.1 / design §3.1).
 *
 * SINGLE SOURCE OF TRUTH: always reads the Horizen hub, regardless of the wallet's active
 * chain — Base has no rate source (design §4 item 3). Refreshes every block so the live rise
 * is visible (harvest is rate-neutral, so the number only ever climbs smoothly — no jumps).
 */
export function useExchangeRate() {
  const address = horizenAddress("stLighter");

  const query = useReadContract({
    address,
    abi: abis.stLighter,
    functionName: "convertToAssets",
    args: [ONE_LTZEN],
    chainId: HUB_CHAIN_ID,
    query: {
      enabled: Boolean(address),
      // Per-block-ish refresh; Caldera testnet blocks are fast. TanStack keeps the previous
      // value while refetching so the HeroRate doesn't flash.
      refetchInterval: 4_000,
    },
  });

  return {
    /** Rate in wei where 1e18 == 1.0 ltZEN→ZEN; `undefined` until loaded. */
    rate: query.data as bigint | undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    isConfigured: Boolean(address),
    refetch: query.refetch,
  };
}

"use client";

import { useReadContract } from "wagmi";
import { abis, horizenAddress } from "@/config/contracts";
import { HUB_CHAIN_ID } from "@/config/chains";

/**
 * Protocol-level stats for the Overview ProtocolStatsCard (uiux §3.4). Public, no wallet
 * needed. All read from the Horizen hub.
 *   - totalAssets  → TVL in ZEN ("Total Staked")
 *   - issuedShares → ltZEN accounting units
 */
export function useProtocolStats() {
  const address = horizenAddress("stLighter");
  const enabled = Boolean(address);
  const base = {
    address,
    abi: abis.stLighter,
    chainId: HUB_CHAIN_ID,
    query: { enabled, refetchInterval: 8_000 },
  } as const;

  const totalAssets = useReadContract({ ...base, functionName: "totalAssets" });
  const issuedShares = useReadContract({ ...base, functionName: "issuedShares" });

  return {
    totalAssets: totalAssets.data as bigint | undefined,
    issuedShares: issuedShares.data as bigint | undefined,
    isLoading: totalAssets.isLoading || issuedShares.isLoading,
    isError: totalAssets.isError || issuedShares.isError,
    isConfigured: enabled,
  };
}

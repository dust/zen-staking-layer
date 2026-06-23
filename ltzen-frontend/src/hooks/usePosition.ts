"use client";

import { useAccount, useChainId, useReadContract } from "wagmi";
import { addresses } from "@/config/contracts";
import { abis } from "@/config/contracts";
import { isSupportedChainId } from "@/config/chains";
import { applyRate } from "@/lib/format";
import { useExchangeRate } from "./useExchangeRate";

/**
 * Personal position (uiux §3.2 / §0.1). Requires a connected wallet.
 *
 * Reads the account's ltZEN balance on the ACTIVE chain (ltZEN circulates on both Horizen and
 * Base), then values it in ZEN using the Horizen rate (single source — usePosition never values
 * with a Base-local rate because Base has none). Primary display is ZEN value; raw shares are
 * secondary (never the headline number).
 */
export function usePosition() {
  const { address: account, isConnected } = useAccount();
  const chainId = useChainId();
  const { rate } = useExchangeRate();

  // ltZEN address for whichever supported chain the wallet is on.
  const ltZenAddress = isSupportedChainId(chainId)
    ? (addresses[chainId] as { ltZEN?: `0x${string}` }).ltZEN
    : undefined;

  const balanceQuery = useReadContract({
    address: ltZenAddress,
    abi: abis.ltZEN,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    chainId: isSupportedChainId(chainId) ? chainId : undefined,
    query: {
      enabled: Boolean(account && ltZenAddress),
      refetchInterval: 8_000,
    },
  });

  const shares = balanceQuery.data as bigint | undefined;
  const zenValue =
    shares !== undefined && rate !== undefined ? applyRate(shares, rate) : undefined;

  return {
    /** Raw ltZEN balance (shares) on the active chain. */
    shares,
    /** ZEN value = shares × Horizen rate. The headline number. */
    zenValue,
    isConnected,
    isLoading: balanceQuery.isLoading,
    isError: balanceQuery.isError,
    isConfigured: Boolean(ltZenAddress),
  };
}

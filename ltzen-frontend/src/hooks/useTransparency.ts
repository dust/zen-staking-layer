"use client";

import { useReadContract, useStorageAt } from "wagmi";
import type { Address } from "viem";
import { abis, horizenAddress } from "@/config/contracts";
import { HUB_CHAIN_ID } from "@/config/chains";

/**
 * Raw on-chain metrics for the Transparency page (uiux §7). Everything is read live from the
 * Horizen hub so a user can cross-check each value against the explorer links rendered beside
 * it — the frontend only displays, never derives or rounds these.
 *
 *   - rewardPerTokenAccumulated → ZenStaker accumulator (1e36-scaled raw)
 *   - totalAssets / issuedShares / feeBps / paused → StLighter (proxy)
 *   - minter → ltZEN (the vault authorized to mint/burn)
 *   - implementation → ERC-1967 logic slot behind the stLighter proxy
 */

/** keccak256("eip1967.proxy.implementation") - 1 (ERC-1967). */
const ERC1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

export function useTransparency() {
  const stLighter = horizenAddress("stLighter");
  const ltZEN = horizenAddress("ltZEN");
  const zenStaker = horizenAddress("zenStaker");

  const stBase = {
    address: stLighter,
    abi: abis.stLighter,
    chainId: HUB_CHAIN_ID,
    query: { enabled: Boolean(stLighter), refetchInterval: 12_000 },
  } as const;

  const totalAssets = useReadContract({ ...stBase, functionName: "totalAssets" });
  const issuedShares = useReadContract({ ...stBase, functionName: "issuedShares" });
  const feeBps = useReadContract({ ...stBase, functionName: "feeBps" });
  const paused = useReadContract({ ...stBase, functionName: "paused" });

  const rewardPerToken = useReadContract({
    address: zenStaker,
    abi: abis.zenStaker,
    chainId: HUB_CHAIN_ID,
    functionName: "rewardPerTokenAccumulated",
    query: { enabled: Boolean(zenStaker), refetchInterval: 12_000 },
  });

  const minter = useReadContract({
    address: ltZEN,
    abi: abis.ltZEN,
    chainId: HUB_CHAIN_ID,
    functionName: "minter",
    query: { enabled: Boolean(ltZEN), refetchInterval: 60_000 },
  });

  // ERC-1967 implementation slot behind the stLighter proxy (right-most 20 bytes).
  const implSlot = useStorageAt({
    address: stLighter,
    slot: ERC1967_IMPL_SLOT,
    chainId: HUB_CHAIN_ID,
    query: { enabled: Boolean(stLighter), refetchInterval: 60_000 },
  });
  const implementation =
    implSlot.data && implSlot.data.length >= 42
      ? (`0x${implSlot.data.slice(-40)}` as Address)
      : undefined;

  return {
    rewardPerToken: rewardPerToken.data as bigint | undefined,
    totalAssets: totalAssets.data as bigint | undefined,
    issuedShares: issuedShares.data as bigint | undefined,
    feeBps: feeBps.data as bigint | undefined,
    paused: paused.data as boolean | undefined,
    minter: minter.data as Address | undefined,
    implementation,
    isLoading:
      totalAssets.isLoading ||
      issuedShares.isLoading ||
      feeBps.isLoading ||
      paused.isLoading ||
      rewardPerToken.isLoading ||
      minter.isLoading,
    isError:
      totalAssets.isError ||
      issuedShares.isError ||
      feeBps.isError ||
      paused.isError ||
      rewardPerToken.isError ||
      minter.isError,
  };
}

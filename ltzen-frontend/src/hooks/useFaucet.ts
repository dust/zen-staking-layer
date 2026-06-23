"use client";

/**
 * useFaucet — mint test ZEN on Horizen (M2; uiux §4 "Get test ZEN").
 *
 * MockZEN.mint(to, amount) is unrestricted on the testnet so users can try staking. We mint a
 * fixed 256 ZEN. Horizen-only: the faucet entrypoint is gated by chainGating (faucet ∈
 * HORIZEN_ONLY); on Base the Stake page guides a chain switch instead of calling this.
 *
 * On success we invalidate the connected account's ZEN balance so the Stake form's "Balance"
 * and the deposit max reflect the new tokens immediately.
 */

import { useCallback } from "react";
import { useAccount } from "wagmi";
import { writeContract } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { parseEther, type Hex } from "viem";
import { HUB_CHAIN_ID } from "@/config/chains";
import { abis, horizenAddress } from "@/config/contracts";
import { copy } from "@/lib/copy";
import { useTxLifecycle } from "./useTxLifecycle";

/** Fixed faucet grant (frontend-plan M2: 领 256 ZEN). */
export const FAUCET_AMOUNT_ZEN = 256n;

export function useFaucet() {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const lifecycle = useTxLifecycle("faucet");

  const zenAddress = horizenAddress("zen");
  const isConfigured = Boolean(zenAddress);

  const mint = useCallback(async () => {
    if (!address || !zenAddress) return;
    await lifecycle.runStep({
      chainId: HUB_CHAIN_ID,
      signingMessage: copy.cta.gettingTestZen,
      pendingMessage: copy.tx.pending,
      successMessage: copy.faucet.success,
      send: (cfg): Promise<Hex> =>
        writeContract(cfg, {
          chainId: HUB_CHAIN_ID,
          address: zenAddress,
          abi: abis.zen,
          functionName: "mint",
          args: [address, parseEther(FAUCET_AMOUNT_ZEN.toString())],
        }),
    });
    // Refresh ZEN balance reads (Stake form, max button).
    await queryClient.invalidateQueries();
  }, [address, zenAddress, lifecycle, queryClient]);

  return {
    mint,
    state: lifecycle.state,
    isBusy: lifecycle.isBusy,
    isConfigured,
    isConnected: Boolean(address),
  };
}

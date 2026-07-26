"use client";

/**
 * useFaucet — mint test ZEN on **Base** (MockZEN ERC20 faucet).
 *
 * Horizen ZEN is native ZenTokenOFT and cannot be arbitrarily minted. Test inventory starts
 * on Base (max 256 ZEN per mint), then users Stake from Base or bridge to Horizen.
 */

import { useCallback } from "react";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import { getAccount, writeContract } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { parseEther, type Hex } from "viem";
import { SPOKE_CHAIN_ID } from "@/config/chains";
import { abis, baseAddress } from "@/config/contracts";
import { copy } from "@/lib/copy";
import { useTxLifecycle } from "./useTxLifecycle";

/** Fixed faucet grant (MockZEN.MAX_MINT_PER_CALL = 256e18). */
export const FAUCET_AMOUNT_ZEN = 256n;

export function useFaucet() {
  const { address } = useAccount();
  const config = useConfig();
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();
  const lifecycle = useTxLifecycle("faucet");

  const zenAddress = baseAddress("zen");
  const isConfigured = Boolean(zenAddress);

  const mint = useCallback(async () => {
    if (!address || !zenAddress) return;
    const active = getAccount(config).chainId;
    if (active !== SPOKE_CHAIN_ID) {
      await switchChainAsync({ chainId: SPOKE_CHAIN_ID });
    }
    await lifecycle.runStep({
      chainId: SPOKE_CHAIN_ID,
      signingMessage: copy.cta.gettingTestZen,
      pendingMessage: copy.tx.pending,
      successMessage: copy.faucet.success,
      send: (cfg): Promise<Hex> =>
        writeContract(cfg, {
          chainId: SPOKE_CHAIN_ID,
          address: zenAddress,
          abi: abis.zen,
          functionName: "mint",
          args: [address, parseEther(FAUCET_AMOUNT_ZEN.toString())],
        }),
    });
    await queryClient.invalidateQueries();
  }, [address, zenAddress, config, switchChainAsync, lifecycle, queryClient]);

  return {
    mint,
    state: lifecycle.state,
    isBusy: lifecycle.isBusy,
    isConfigured,
    isConnected: Boolean(address),
  };
}

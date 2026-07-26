"use client";

/**
 * useDeposit — the Stake write closure (uiux §4.2 state machine).
 *
 * Standard path: validate → [allowance < amount ? approve] → deposit → wait → success.
 */

import { useCallback, useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { writeContract } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { type Hex } from "viem";
import { HUB_CHAIN_ID } from "@/config/chains";
import { abis, horizenAddress } from "@/config/contracts";
import { copy } from "@/lib/copy";
import { useTxLifecycle } from "./useTxLifecycle";

export interface UseDepositArgs {
  amountWei: bigint | undefined;
}

export function useDeposit({ amountWei }: UseDepositArgs) {
  const { address: account } = useAccount();
  const queryClient = useQueryClient();
  const lifecycle = useTxLifecycle("deposit");

  const stLighter = horizenAddress("stLighter");
  const zen = horizenAddress("zen");
  const isConfigured = Boolean(stLighter && zen);

  const balanceQuery = useReadContract({
    chainId: HUB_CHAIN_ID,
    address: zen,
    abi: abis.zen,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: Boolean(account && zen), refetchInterval: 8_000 },
  });
  const balance = balanceQuery.data as bigint | undefined;

  const allowanceQuery = useReadContract({
    chainId: HUB_CHAIN_ID,
    address: zen,
    abi: abis.zen,
    functionName: "allowance",
    args: account && stLighter ? [account, stLighter] : undefined,
    query: { enabled: Boolean(account && zen && stLighter), refetchInterval: 8_000 },
  });
  const allowance = allowanceQuery.data as bigint | undefined;

  const previewQuery = useReadContract({
    chainId: HUB_CHAIN_ID,
    address: stLighter,
    abi: abis.stLighter,
    functionName: "previewDeposit",
    args: amountWei !== undefined ? [amountWei] : undefined,
    query: { enabled: Boolean(stLighter && amountWei && amountWei > 0n) },
  });
  const previewShares = previewQuery.data as bigint | undefined;

  const needsApproval = useMemo(() => {
    if (amountWei === undefined || allowance === undefined) return false;
    return allowance < amountWei;
  }, [amountWei, allowance]);

  const insufficientBalance = useMemo(() => {
    if (amountWei === undefined || balance === undefined) return false;
    return amountWei > balance;
  }, [amountWei, balance]);

  const deposit = useCallback(async () => {
    if (!account || !stLighter || !zen || !amountWei) return;

    if (needsApproval) {
      await lifecycle.runStep({
        chainId: HUB_CHAIN_ID,
        signingMessage: copy.cta.approving,
        pendingMessage: copy.tx.pending,
        successMessage: copy.tx.approveConfirmed,
        send: (cfg): Promise<Hex> =>
          writeContract(cfg, {
            chainId: HUB_CHAIN_ID,
            address: zen,
            abi: abis.zen,
            functionName: "approve",
            args: [stLighter, amountWei],
          }),
      });
      await allowanceQuery.refetch();
    }

    await lifecycle.runStep({
      chainId: HUB_CHAIN_ID,
      signingMessage: copy.cta.depositing,
      pendingMessage: copy.tx.pending,
      successMessage: copy.tx.depositConfirmed,
      send: (cfg): Promise<Hex> =>
        writeContract(cfg, {
          chainId: HUB_CHAIN_ID,
          address: stLighter,
          abi: abis.stLighter,
          functionName: "deposit",
          args: [amountWei, account],
        }),
    });

    await queryClient.invalidateQueries();
  }, [account, stLighter, zen, amountWei, needsApproval, lifecycle, allowanceQuery, queryClient]);

  return {
    balance,
    allowance,
    previewShares,
    isPreviewLoading: previewQuery.isLoading,
    needsApproval,
    insufficientBalance,
    state: lifecycle.state,
    isBusy: lifecycle.isBusy,
    deposit,
    isConfigured,
    isConnected: Boolean(account),
  };
}

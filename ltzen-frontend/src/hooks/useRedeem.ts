"use client";

/**
 * useRedeem — the Redeem write closure (uiux §5.1).
 *
 * Standard path:  validate → redeem(shares, receiver) → wait → success.
 * Gasless path:   validate → sign RedeemWithSig → relayer.submit → track → success.
 *
 * Unlike deposit, redeem needs NO approve and NO ERC20 permit: the contract burns the user's
 * ltZEN shares directly (`_ltZen.burn(owner, shares)` — internal accounting). The relayer fee is
 * taken from the redeemed ZEN, so `maxFeeZen` is sized off the previewed assets (the contract
 * reverts if `gasFee >= assets`).
 *
 * M3 testnet: with no relayer endpoint, DirectContractRelayer broadcasts `redeemWithSig` from the
 * connected wallet (one tx, user pays gas). Production swaps to HttpRelayer for true gasless.
 */

import { useCallback, useMemo, useState } from "react";
import { useAccount, useConfig, useReadContract } from "wagmi";
import { writeContract } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { type Hex } from "viem";
import { HUB_CHAIN_ID, horizen } from "@/config/chains";
import { abis, horizenAddress } from "@/config/contracts";
import { copy } from "@/lib/copy";
import { classifyTxError, RelayerTimeoutError } from "@/lib/errors";
import { signRedeemWithSig } from "@/lib/eip712";
import { createRelayer, type RelayResult } from "@/relayer";
import { useToast } from "@/components/common/Toast";
import { useTxLifecycle } from "./useTxLifecycle";

const GASLESS_TOAST_ID = "gasless-redeem";

function horizenTxUrl(hash: Hex): string | undefined {
  const base = horizen.blockExplorers?.default?.url;
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : undefined;
}

/** How long the signature stays valid (seconds). */
const SIG_TTL_SEC = 30 * 60;
/** Max relayer fee the user authorizes, as a fraction of the redeemed ZEN (1%). */
const MAX_FEE_BPS = 100n;

export type GaslessRedeemPhase =
  | "idle"
  | "signing"
  | "submitting"
  | "relaying"
  | "confirmed"
  | "timeout"
  | "failed";

export interface UseRedeemArgs {
  /** ltZEN shares to redeem (wei). */
  sharesWei: bigint | undefined;
}

export function useRedeem({ sharesWei }: UseRedeemArgs) {
  const { address: account } = useAccount();
  const config = useConfig();
  const queryClient = useQueryClient();
  const lifecycle = useTxLifecycle("redeem");
  const { push } = useToast();

  const stLighter = horizenAddress("stLighter");
  const ltZEN = horizenAddress("ltZEN");
  const isConfigured = Boolean(stLighter && ltZEN);

  const [gaslessPhase, setGaslessPhase] = useState<GaslessRedeemPhase>("idle");
  const [gaslessFeeZen, setGaslessFeeZen] = useState<bigint | undefined>();
  const [gaslessTxHash, setGaslessTxHash] = useState<Hex | undefined>();

  const balanceQuery = useReadContract({
    chainId: HUB_CHAIN_ID,
    address: ltZEN,
    abi: abis.ltZEN,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: Boolean(account && ltZEN), refetchInterval: 8_000 },
  });
  const shareBalance = balanceQuery.data as bigint | undefined;

  const previewQuery = useReadContract({
    chainId: HUB_CHAIN_ID,
    address: stLighter,
    abi: abis.stLighter,
    functionName: "previewRedeem",
    args: sharesWei !== undefined ? [sharesWei] : undefined,
    query: { enabled: Boolean(stLighter && sharesWei && sharesWei > 0n) },
  });
  const previewAssets = previewQuery.data as bigint | undefined;

  const insufficientShares = useMemo(() => {
    if (sharesWei === undefined || shareBalance === undefined) return false;
    return sharesWei > shareBalance;
  }, [sharesWei, shareBalance]);

  /** Redeeming the user's whole ltZEN balance clears their position (uiux §5.1). */
  const isFullRedeem = useMemo(() => {
    if (sharesWei === undefined || shareBalance === undefined || shareBalance === 0n) return false;
    return sharesWei === shareBalance;
  }, [sharesWei, shareBalance]);

  // Fee is charged on the redeemed ZEN; size maxFeeZen off the preview (contract: gasFee < assets).
  const maxFeeZen = useMemo(
    () => (previewAssets !== undefined ? (previewAssets * MAX_FEE_BPS) / 10_000n : 0n),
    [previewAssets],
  );

  const redeem = useCallback(async () => {
    if (!account || !stLighter || !sharesWei) return;

    await lifecycle.runStep({
      chainId: HUB_CHAIN_ID,
      signingMessage: copy.cta.redeeming,
      pendingMessage: copy.tx.pending,
      successMessage: copy.tx.redeemConfirmed,
      send: (cfg): Promise<Hex> =>
        writeContract(cfg, {
          chainId: HUB_CHAIN_ID,
          address: stLighter,
          abi: abis.stLighter,
          functionName: "redeem",
          args: [sharesWei, account],
        }),
    });

    await queryClient.invalidateQueries();
  }, [account, stLighter, sharesWei, lifecycle, queryClient]);

  const redeemGasless = useCallback(async () => {
    if (!account || !stLighter || !sharesWei) return;
    const relayer = createRelayer(config);

    try {
      setGaslessPhase("signing");
      setGaslessFeeZen(undefined);
      setGaslessTxHash(undefined);
      push({ id: GASLESS_TOAST_ID, tone: "pending", message: copy.redeem.signing });

      const deadline = BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SEC);

      const { signature } = await signRedeemWithSig(config, HUB_CHAIN_ID, stLighter, {
        shares: sharesWei,
        receiver: account,
        maxFeeZen,
        user: account,
        deadline,
      });

      setGaslessPhase("submitting");
      push({ id: GASLESS_TOAST_ID, tone: "pending", message: copy.redeem.submitting });

      const handle = await relayer.submit({
        kind: "redeemWithSig",
        chainId: HUB_CHAIN_ID,
        verifyingContract: stLighter,
        user: account,
        receiver: account,
        amount: sharesWei.toString(),
        maxFeeZen: maxFeeZen.toString(),
        deadline: Number(deadline),
        signature,
      });

      await new Promise<void>((resolve, reject) => {
        const unsub = handle.subscribe((r: RelayResult) => {
          if (r.status === "relaying") {
            setGaslessPhase("relaying");
            push({ id: GASLESS_TOAST_ID, tone: "pending", message: copy.redeem.relayerWaiting });
          }
          if (r.feeZen) {
            try {
              setGaslessFeeZen(BigInt(r.feeZen));
            } catch {
              /* ignore malformed fee */
            }
          }
          if (r.txHash) setGaslessTxHash(r.txHash);

          if (r.status === "confirmed") {
            setGaslessPhase("confirmed");
            push({
              id: GASLESS_TOAST_ID,
              tone: "success",
              message: copy.tx.redeemConfirmed,
              explorerUrl: r.txHash ? horizenTxUrl(r.txHash) : undefined,
              explorerLabel: copy.cta.viewExplorer,
            });
            unsub();
            resolve();
          } else if (r.status === "timeout") {
            setGaslessPhase("timeout");
            push({ id: GASLESS_TOAST_ID, tone: "error", message: copy.errors.relayerTimeout });
            unsub();
            reject(new RelayerTimeoutError());
          } else if (r.status === "failed") {
            setGaslessPhase("failed");
            const classified = classifyTxError(new Error(r.error ?? "relayer failed"));
            push({ id: GASLESS_TOAST_ID, tone: "error", message: classified.message });
            unsub();
            reject(classified);
          }
        });
      });

      await queryClient.invalidateQueries();
    } catch (err) {
      if (!(err instanceof RelayerTimeoutError)) {
        setGaslessPhase("failed");
        const classified = classifyTxError(err);
        push({
          id: GASLESS_TOAST_ID,
          tone: classified.tone === "neutral" ? "neutral" : "error",
          message: classified.message,
        });
      }
      throw err;
    }
  }, [account, stLighter, sharesWei, maxFeeZen, config, queryClient, push]);

  const resetGasless = useCallback(() => {
    setGaslessPhase("idle");
    setGaslessFeeZen(undefined);
    setGaslessTxHash(undefined);
  }, []);

  return {
    shareBalance,
    previewAssets,
    isPreviewLoading: previewQuery.isLoading,
    insufficientShares,
    isFullRedeem,
    maxFeeZen,
    state: lifecycle.state,
    isBusy: lifecycle.isBusy,
    redeem,
    redeemGasless,
    gaslessPhase,
    gaslessFeeZen,
    gaslessTxHash,
    resetGasless,
    isConfigured,
    isConnected: Boolean(account),
  };
}

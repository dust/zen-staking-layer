"use client";

/**
 * useRedeem — the Redeem write closure (uiux §5.1).
 *
 * Standard path:  validate → redeem(shares, receiver) → wait → success.
 * Gasless path:   fee-quote → sign RedeemWithSig(maxFeeZen) → relayer.submit → track → success.
 */

import { useCallback, useState } from "react";
import { useAccount, useConfig, useReadContract } from "wagmi";
import { writeContract } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { type Hex } from "viem";
import { HUB_CHAIN_ID, horizen } from "@/config/chains";
import { abis, horizenAddress } from "@/config/contracts";
import { copy } from "@/lib/copy";
import { classifyTxError, RelayerTimeoutError } from "@/lib/errors";
import { FeeQuoteError, isQuoteExpired } from "@/lib/feeQuote";
import { signRedeemWithSig } from "@/lib/eip712";
import { resolveGaslessFeeRelayer } from "@/config/relayer";
import { createRelayer, type RelayResult } from "@/relayer";
import { useToast } from "@/components/common/Toast";
import { useFeeQuote } from "./useFeeQuote";
import { useTxLifecycle } from "./useTxLifecycle";

const GASLESS_TOAST_ID = "gasless-redeem";
const SIG_TTL_SEC = 30 * 60;

function horizenTxUrl(hash: Hex): string | undefined {
  const base = horizen.blockExplorers?.default?.url;
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : undefined;
}

export type GaslessRedeemPhase =
  | "idle"
  | "signing"
  | "submitting"
  | "relaying"
  | "confirmed"
  | "timeout"
  | "failed";

export interface UseRedeemArgs {
  sharesWei: bigint | undefined;
  /** Fetch fee quote when gasless UI is enabled. */
  gaslessEnabled?: boolean;
}

export function useRedeem({ sharesWei, gaslessEnabled = false }: UseRedeemArgs) {
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

  const feeQuote = useFeeQuote({
    kind: "redeemWithSig",
    amount: sharesWei && sharesWei > 0n ? sharesWei.toString() : undefined,
    verifyingContract: stLighter,
    enabled: gaslessEnabled && Boolean(sharesWei && sharesWei > 0n),
  });

  const insufficientShares =
    sharesWei !== undefined && shareBalance !== undefined && sharesWei > shareBalance;

  const isFullRedeem =
    sharesWei !== undefined &&
    shareBalance !== undefined &&
    shareBalance !== 0n &&
    sharesWei === shareBalance;

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
    if (!feeQuote.quote || feeQuote.error) {
      throw feeQuote.error ?? new FeeQuoteError("quote_unavailable", "fee quote required");
    }
    if (isQuoteExpired(feeQuote.quote)) {
      throw new FeeQuoteError("fee_quote_stale", copy.redeem.gaslessFeeStale);
    }

    const maxFeeZen = BigInt(feeQuote.quote.maxFeeZen);
    const relayer = createRelayer(config);

    try {
      setGaslessPhase("signing");
      setGaslessFeeZen(BigInt(feeQuote.quote.feeZen));
      setGaslessTxHash(undefined);
      push({ id: GASLESS_TOAST_ID, tone: "pending", message: copy.redeem.signing });

      const deadline = BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SEC);
      const feeRelayer = resolveGaslessFeeRelayer(account);
      const { signature } = await signRedeemWithSig(config, HUB_CHAIN_ID, stLighter, {
        shares: sharesWei,
        receiver: account,
        maxFeeZen,
        relayer: feeRelayer,
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
        relayer: feeRelayer,
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
              /* ignore */
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
        const msg =
          err instanceof FeeQuoteError
            ? err.code === "fee_quote_stale"
              ? copy.redeem.gaslessFeeStale
              : err.message
            : classifyTxError(err).message;
        const classified = err instanceof FeeQuoteError ? null : classifyTxError(err);
        push({
          id: GASLESS_TOAST_ID,
          tone: classified?.tone === "neutral" ? "neutral" : "error",
          message: msg,
        });
      }
      throw err;
    }
  }, [account, stLighter, sharesWei, feeQuote.quote, feeQuote.error, config, queryClient, push]);

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
    maxFeeZen: feeQuote.maxFeeZen,
    feeQuote,
    state: lifecycle.state,
    isBusy: lifecycle.isBusy,
    redeem,
    redeemGasless,
    gaslessPhase,
    gaslessFeeZen: gaslessFeeZen ?? feeQuote.feeZen,
    gaslessTxHash,
    resetGasless,
    isConfigured,
    isConnected: Boolean(account),
  };
}

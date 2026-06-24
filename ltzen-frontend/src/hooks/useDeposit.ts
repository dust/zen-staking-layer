"use client";

/**
 * useDeposit — the Stake write closure (uiux §4.2 state machine + §4.3 paths).
 *
 * Standard path:  validate → [allowance < amount ? approve] → deposit → wait → success.
 * Gasless path:   validate → sign DepositWithSig + ZEN Permit → relayer.submit → track → success.
 *                 No on-chain approve (depositWithSigAndPermit).
 *
 * M2 testnet: when no relayer endpoint is configured, DirectContractRelayer broadcasts
 * depositWithSigAndPermit from the connected wallet (one tx, user pays gas, no approve).
 * Production: HttpRelayer submits on the user's behalf (true gasless).
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
import { signDepositWithSig, signZenPermit } from "@/lib/eip712";
import { createRelayer, type RelayResult } from "@/relayer";
import { useToast } from "@/components/common/Toast";
import { useTxLifecycle } from "./useTxLifecycle";

const GASLESS_TOAST_ID = "gasless-deposit";

function horizenTxUrl(hash: Hex): string | undefined {
  const base = horizen.blockExplorers?.default?.url;
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : undefined;
}

/** How long signatures stay valid (seconds). */
const SIG_TTL_SEC = 30 * 60;
/** Max relayer fee the user authorizes, as a fraction of the deposit (1%). */
const MAX_FEE_BPS = 100n;

export type GaslessPhase =
  | "idle"
  | "signing-deposit"
  | "signing-permit"
  | "submitting"
  | "relaying"
  | "confirmed"
  | "timeout"
  | "failed";

export interface UseDepositArgs {
  amountWei: bigint | undefined;
}

export function useDeposit({ amountWei }: UseDepositArgs) {
  const { address: account } = useAccount();
  const config = useConfig();
  const queryClient = useQueryClient();
  const lifecycle = useTxLifecycle("deposit");
  const { push } = useToast();

  const stLighter = horizenAddress("stLighter");
  const zen = horizenAddress("zen");
  const isConfigured = Boolean(stLighter && zen);

  const [gaslessPhase, setGaslessPhase] = useState<GaslessPhase>("idle");
  const [gaslessFeeZen, setGaslessFeeZen] = useState<bigint | undefined>();
  const [gaslessTxHash, setGaslessTxHash] = useState<Hex | undefined>();

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

  const maxFeeZen = useMemo(
    () => (amountWei !== undefined ? (amountWei * MAX_FEE_BPS) / 10_000n : 0n),
    [amountWei],
  );

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

  const depositGasless = useCallback(async () => {
    if (!account || !stLighter || !zen || !amountWei) return;
    const relayer = createRelayer(config);

    try {
      setGaslessPhase("signing-deposit");
      setGaslessFeeZen(undefined);
      setGaslessTxHash(undefined);
      push({ id: GASLESS_TOAST_ID, tone: "pending", message: copy.stake.signingDeposit });

      const deadline = BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SEC);
      const permitDeadline = deadline;

      const { signature } = await signDepositWithSig(config, HUB_CHAIN_ID, stLighter, {
        assets: amountWei,
        receiver: account,
        maxFeeZen,
        user: account,
        deadline,
      });

      setGaslessPhase("signing-permit");
      push({ id: GASLESS_TOAST_ID, tone: "pending", message: copy.stake.signingPermit });

      const permit = await signZenPermit(config, HUB_CHAIN_ID, zen, {
        owner: account,
        spender: stLighter,
        value: amountWei,
        deadline: permitDeadline,
      });

      setGaslessPhase("submitting");
      push({ id: GASLESS_TOAST_ID, tone: "pending", message: copy.stake.submitting });

      const handle = await relayer.submit({
        kind: "depositWithSigAndPermit",
        chainId: HUB_CHAIN_ID,
        verifyingContract: stLighter,
        user: account,
        receiver: account,
        amount: amountWei.toString(),
        maxFeeZen: maxFeeZen.toString(),
        deadline: Number(deadline),
        signature,
        permit,
      });

      await new Promise<void>((resolve, reject) => {
        const unsub = handle.subscribe((r: RelayResult) => {
          if (r.status === "relaying") {
            setGaslessPhase("relaying");
            push({ id: GASLESS_TOAST_ID, tone: "pending", message: copy.stake.relayerWaiting });
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
              message: copy.tx.depositConfirmed,
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
            push({
              id: GASLESS_TOAST_ID,
              tone: "error",
              message: classified.message,
            });
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
  }, [account, stLighter, zen, amountWei, maxFeeZen, config, queryClient, push]);

  const resetGasless = useCallback(() => {
    setGaslessPhase("idle");
    setGaslessFeeZen(undefined);
    setGaslessTxHash(undefined);
  }, []);

  return {
    balance,
    allowance,
    previewShares,
    isPreviewLoading: previewQuery.isLoading,
    needsApproval,
    insufficientBalance,
    maxFeeZen,
    state: lifecycle.state,
    isBusy: lifecycle.isBusy,
    deposit,
    depositGasless,
    gaslessPhase,
    gaslessFeeZen,
    gaslessTxHash,
    resetGasless,
    isConfigured,
    isConnected: Boolean(account),
  };
}

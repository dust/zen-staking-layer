"use client";

/**
 * useDeposit — the Stake write closure (uiux §4.2 state machine + §4.3 paths).
 *
 * Standard path:  validate → [allowance < amount ? approve] → deposit → wait → success.
 * Gasless path:   validate → sign EIP-712 (DepositWithSig) → relayer.submit → track → success.
 *
 * Reads:
 *   - ZEN balance (gates "≤ balance" + the Max button)
 *   - allowance(account, stLighter) (decides whether approve is needed)
 *   - previewDeposit(amount) (live "you receive" in ltZEN shares)
 *
 * The gasless signature payload MUST match StLighter.DEPOSIT_WITH_SIG_TYPEHASH exactly:
 *   DepositWithSig(uint256 assets,address receiver,uint256 maxFeeZen,address user,uint256 nonce,uint256 deadline)
 * Note feeZen is NOT signed — the relayer fills it (≤ maxFeeZen). The EIP-712 domain is read from
 * the contract's eip712Domain() at runtime so it can't drift from the deployed contract.
 *
 * Everything is Horizen-only (deposit ∈ HORIZEN_ONLY); the page guides a chain switch on Base.
 */

import { useCallback, useMemo, useState } from "react";
import { useAccount, useConfig, useReadContract } from "wagmi";
import { readContract, signTypedData, writeContract } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { type Address, type Hex } from "viem";
import { HUB_CHAIN_ID, horizen } from "@/config/chains";
import { abis, horizenAddress } from "@/config/contracts";
import { copy } from "@/lib/copy";
import { classifyTxError, RelayerTimeoutError } from "@/lib/errors";
import { getRelayer, type RelayResult } from "@/relayer";
import { useToast } from "@/components/common/Toast";
import { useTxLifecycle } from "./useTxLifecycle";

/** Explorer tx link on Horizen (gasless tracks outside useTxLifecycle, so build it here). */
function horizenTxUrl(hash: Hex): string | undefined {
  const base = horizen.blockExplorers?.default?.url;
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : undefined;
}


/** How long a gasless signature stays valid (seconds). */
const SIG_TTL_SEC = 30 * 60;
/** Max relayer fee the user authorizes, as a fraction of the deposit (1% here). */
const MAX_FEE_BPS = 100n;

export type GaslessPhase =
  | "idle"
  | "signing"
  | "submitting"
  | "relaying"
  | "confirmed"
  | "timeout"
  | "failed";

export interface UseDepositArgs {
  /** Parsed deposit amount in wei (ZEN, 18 decimals). undefined when the input is empty/invalid. */
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

  // --- Reads --------------------------------------------------------------
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

  // --- Derived validation -------------------------------------------------
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

  // --- Standard path ------------------------------------------------------
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
            // Approve exactly the deposit amount (not unlimited) — safer default.
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

  // --- Gasless path (depositWithSig) -------------------------------------
  const depositGasless = useCallback(async () => {
    if (!account || !stLighter || !amountWei) return;
    const relayer = getRelayer();

    try {
      setGaslessPhase("signing");
      setGaslessFeeZen(undefined);
      setGaslessTxHash(undefined);

      // Read canonical EIP-712 domain + the user's current nonce from the contract.
      const [domain, nonce] = await Promise.all([
        readContract(config, {
          chainId: HUB_CHAIN_ID,
          address: stLighter,
          abi: abis.stLighter,
          functionName: "eip712Domain",
        }) as Promise<readonly [string, string, string, bigint, Address, Hex, readonly bigint[]]>,
        readContract(config, {
          chainId: HUB_CHAIN_ID,
          address: stLighter,
          abi: abis.stLighter,
          functionName: "nonces",
          args: [account],
        }) as Promise<bigint>,
      ]);

      const [, name, version, chainId, verifyingContract] = domain;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SEC);

      const signature = await signTypedData(config, {
        domain: { name, version, chainId: Number(chainId), verifyingContract },
        types: {
          DepositWithSig: [
            { name: "assets", type: "uint256" },
            { name: "receiver", type: "address" },
            { name: "maxFeeZen", type: "uint256" },
            { name: "user", type: "address" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "DepositWithSig",
        message: {
          assets: amountWei,
          receiver: account,
          maxFeeZen,
          user: account,
          nonce,
          deadline,
        },
      });

      setGaslessPhase("submitting");
      const handle = await relayer.submit({
        kind: "depositWithSig",
        chainId: HUB_CHAIN_ID,
        verifyingContract: stLighter,
        user: account,
        receiver: account,
        amount: amountWei.toString(),
        maxFeeZen: maxFeeZen.toString(),
        deadline: Number(deadline),
        signature,
      });

      // Track relayer status to terminal state.
      await new Promise<void>((resolve, reject) => {
        const unsub = handle.subscribe((r: RelayResult) => {
          if (r.status === "relaying") setGaslessPhase("relaying");
          if (r.feeZen) {
            try {
              setGaslessFeeZen(BigInt(r.feeZen));
            } catch {}
          }
          if (r.txHash) setGaslessTxHash(r.txHash);
          if (r.status === "confirmed") {
            setGaslessPhase("confirmed");
            unsub();
            resolve();
          } else if (r.status === "timeout") {
            setGaslessPhase("timeout");
            unsub();
            reject(new RelayerTimeoutError());
          } else if (r.status === "failed") {
            setGaslessPhase("failed");
            unsub();
            reject(new Error(r.error ?? "relayer failed"));
          }
        });
      });

      await queryClient.invalidateQueries();
    } catch (err) {
      // Re-throw so the page can show classified copy + the fallback CTA. Keep the precise
      // "timeout" phase (it drives the "use a standard deposit" fallback); only mark "failed"
      // for other errors.
      if (!(err instanceof RelayerTimeoutError)) setGaslessPhase("failed");
      throw err;
    }
  }, [account, stLighter, amountWei, maxFeeZen, config, queryClient]);

  return {
    // reads
    balance,
    allowance,
    previewShares,
    isPreviewLoading: previewQuery.isLoading,
    // validation
    needsApproval,
    insufficientBalance,
    maxFeeZen,
    // standard lifecycle
    state: lifecycle.state,
    isBusy: lifecycle.isBusy,
    deposit,
    // gasless
    depositGasless,
    gaslessPhase,
    gaslessFeeZen,
    gaslessTxHash,
    // config
    isConfigured,
    isConnected: Boolean(account),
  };
}

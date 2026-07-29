"use client";

/**
 * Redeem to Base (Wave B):
 * Horizen ltZEN → Egress.redeemAndCredit → bridgeToBase → Base ZEN @ B1.
 * L3 legs go through createRelayer() (BFF+rrelayer when configured).
 */

import { useCallback, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useConfig,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { getAccount, readContract } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { isAddress } from "viem";
import { HUB_CHAIN_ID, SPOKE_CHAIN_ID, base, horizen } from "@/config/chains";
import {
  abis,
  baseAddress,
  horizenAddress,
  redeemToBaseConfigured,
} from "@/config/contracts";
import { resolveGaslessFeeRelayer } from "@/config/relayer";
import { copy } from "@/lib/copy";
import { classifyTxError, logTxError } from "@/lib/errors";
import { FeeQuoteError, fetchFeeQuote, isQuoteExpired } from "@/lib/feeQuote";
import {
  signBridgeToBase,
  signEgressWithdrawToHorizen,
  signRedeemWithSig,
} from "@/lib/eip712";
import { buildOftSendLzReceiveOptions } from "@/lib/stationCompose";
import {
  DEFAULT_OFT_DECIMAL_CONVERSION_RATE,
  truncateOftAmountLD,
} from "@/lib/oftDust";
import { createDirectRelayer, createRelayer, type RelayResult } from "@/relayer";
import { useToast } from "@/components/common/Toast";
import { useFeeQuote } from "./useFeeQuote";

const SIG_TTL_SEC = 30 * 60;
const TOAST_ID = "redeem-to-base";

export type RedeemToBaseStep =
  | "configure"
  | "amount"
  | "confirm-dest"
  | "redeem"
  | "bridge"
  | "wait-base"
  | "done";

export type RedeemToBasePhase =
  | "idle"
  | "signing"
  | "relaying"
  | "waiting"
  | "withdrawing"
  | "confirmed"
  | "failed";

function explorerTxUrl(chainId: number, hash: Hex): string | undefined {
  const chain = chainId === SPOKE_CHAIN_ID ? base : horizen;
  const baseUrl = chain.blockExplorers?.default?.url;
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}/tx/${hash}` : undefined;
}

function waitRelay(handle: {
  subscribe: (l: (r: RelayResult) => void) => () => void;
}): Promise<RelayResult> {
  return new Promise((resolve, reject) => {
    const unsub = handle.subscribe((r) => {
      if (r.status === "confirmed") {
        unsub();
        resolve(r);
      } else if (r.status === "failed" || r.status === "timeout") {
        unsub();
        const msg =
          typeof r.error === "string" && r.error.length > 0
            ? r.error
            : r.status === "timeout"
              ? "relayer timeout"
              : "relay failed";
        reject(new Error(msg));
      }
    });
  });
}

export function useRedeemToBase() {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const config = useConfig();
  const queryClient = useQueryClient();
  const { switchChainAsync } = useSwitchChain();
  const { push } = useToast();

  const egress = horizenAddress("egressStation");
  const bridge = horizenAddress("zenOftStationBridge");
  const stLighter = horizenAddress("stLighter");
  const ltZEN = horizenAddress("ltZEN");
  const baseZen = baseAddress("zen");
  const isConfigured = redeemToBaseConfigured();

  const [sharesWei, setSharesWei] = useState<bigint | undefined>();
  const [dest, setDest] = useState<Address | undefined>();
  const [destConfirmed, setDestConfirmed] = useState(false);
  const [phase, setPhase] = useState<RedeemToBasePhase>("idle");
  const [netAssets, setNetAssets] = useState<bigint | undefined>();
  const [redeemTxHash, setRedeemTxHash] = useState<Hex | undefined>();
  const [bridgeTxHash, setBridgeTxHash] = useState<Hex | undefined>();
  const [baseBalanceBefore, setBaseBalanceBefore] = useState<bigint | undefined>();
  const [error, setError] = useState<string | undefined>();

  const effectiveDest = dest ?? account;

  const ltBalanceQuery = useReadContract({
    chainId: HUB_CHAIN_ID,
    address: ltZEN,
    abi: abis.ltZEN,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: Boolean(account && ltZEN), refetchInterval: 8_000 },
  });
  const ltBalance = ltBalanceQuery.data as bigint | undefined;

  const previewQuery = useReadContract({
    chainId: HUB_CHAIN_ID,
    address: stLighter,
    abi: abis.stLighter,
    functionName: "previewRedeem",
    args: sharesWei !== undefined ? [sharesWei] : undefined,
    query: { enabled: Boolean(stLighter && sharesWei !== undefined && sharesWei > 0n) },
  });
  const previewAssets = previewQuery.data as bigint | undefined;

  const creditedQuery = useReadContract({
    chainId: HUB_CHAIN_ID,
    address: egress,
    abi: abis.egressStation,
    functionName: "credited",
    args: account ? [account] : undefined,
    query: { enabled: Boolean(account && egress), refetchInterval: 5_000 },
  });
  const credited = (creditedQuery.data as bigint | undefined) ?? 0n;

  const decimalConversionRateQuery = useReadContract({
    chainId: HUB_CHAIN_ID,
    address: bridge,
    abi: abis.zenOftStationBridge,
    functionName: "decimalConversionRate",
    query: { enabled: Boolean(bridge) },
  });
  const decimalConversionRate =
    (decimalConversionRateQuery.data as bigint | undefined) ??
    DEFAULT_OFT_DECIMAL_CONVERSION_RATE;

  const previewBaseReceive = useMemo(() => {
    if (previewAssets === undefined) return undefined;
    return truncateOftAmountLD(previewAssets, decimalConversionRate);
  }, [previewAssets, decimalConversionRate]);

  const creditedBaseReceive = useMemo(() => {
    if (credited <= 0n) return undefined;
    return truncateOftAmountLD(credited, decimalConversionRate);
  }, [credited, decimalConversionRate]);

  const baseZenBalanceQuery = useReadContract({
    chainId: SPOKE_CHAIN_ID,
    address: baseZen,
    abi: abis.zen,
    functionName: "balanceOf",
    args: effectiveDest ? [effectiveDest] : undefined,
    query: {
      enabled: Boolean(effectiveDest && baseZen && phase === "waiting"),
      refetchInterval: 8_000,
    },
  });
  const baseZenBalance = baseZenBalanceQuery.data as bigint | undefined;

  const redeemFeeQuote = useFeeQuote({
    kind: "redeemAndCredit",
    amount: sharesWei && sharesWei > 0n ? sharesWei.toString() : undefined,
    verifyingContract: stLighter,
    enabled: Boolean(sharesWei && sharesWei > 0n),
  });

  const maxFeeZen = redeemFeeQuote.maxFeeZen > 0n ? redeemFeeQuote.maxFeeZen : undefined;

  const bridgeAssetsForQuote =
    creditedBaseReceive && creditedBaseReceive > 0n
      ? creditedBaseReceive
      : previewBaseReceive;
  const bridgeFeeQuote = useFeeQuote({
    kind: "bridgeToBase",
    amount:
      bridgeAssetsForQuote && bridgeAssetsForQuote > 0n
        ? bridgeAssetsForQuote.toString()
        : undefined,
    dest: effectiveDest,
    extraOptions: buildOftSendLzReceiveOptions(),
    enabled: Boolean(bridgeAssetsForQuote && bridgeAssetsForQuote > 0n && effectiveDest),
  });

  const baseArrived = useMemo(() => {
    if (baseBalanceBefore === undefined || baseZenBalance === undefined) return false;
    return baseZenBalance > baseBalanceBefore;
  }, [baseBalanceBefore, baseZenBalance]);

  const step: RedeemToBaseStep = useMemo(() => {
    if (!isConfigured) return "configure";
    if (phase === "confirmed" || baseArrived) return "done";
    if (bridgeTxHash && phase === "waiting") return "wait-base";
    // Bridge only when credit exceeds OFT dust floor. After send, ZenOftStationBridge
    // re-credits sub–shared-decimal dust via EgressStation.onBridgeDust — that alone
    // must not keep the wizard on "bridge".
    if ((creditedBaseReceive ?? 0n) > 0n) {
      if (bridgeTxHash) return "wait-base";
      return "bridge";
    }
    if (destConfirmed && sharesWei) return "redeem";
    if (sharesWei) return "confirm-dest";
    return "amount";
  }, [
    isConfigured,
    phase,
    baseArrived,
    bridgeTxHash,
    creditedBaseReceive,
    redeemTxHash,
    destConfirmed,
    sharesWei,
  ]);

  const ensureHorizen = useCallback(async () => {
    const active = getAccount(config).chainId;
    if (active !== HUB_CHAIN_ID) {
      await switchChainAsync({ chainId: HUB_CHAIN_ID });
    }
  }, [config, switchChainAsync]);

  const confirmDest = useCallback(
    (next: Address) => {
      if (!isAddress(next)) {
        setError("Invalid Base destination address");
        return;
      }
      setDest(next);
      setDestConfirmed(true);
      setError(undefined);
    },
    [],
  );

  const relayRedeemAndCredit = useCallback(async () => {
    if (!account || !stLighter || !egress || !sharesWei) return;
    setError(undefined);
    setPhase("signing");
    push({ id: TOAST_ID, tone: "pending", message: copy.redeemToBase.signingRedeem });
    try {
      await ensureHorizen();
      const quote = await fetchFeeQuote({
        kind: "redeemAndCredit",
        amount: sharesWei.toString(),
        verifyingContract: stLighter,
      });
      if (isQuoteExpired(quote)) {
        throw new FeeQuoteError("fee_quote_stale", copy.redeem.gaslessFeeStale);
      }
      const maxFee = BigInt(quote.maxFeeZen);
      const feeRelayer = resolveGaslessFeeRelayer(account);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SEC);
      const { signature } = await signRedeemWithSig(config, HUB_CHAIN_ID, stLighter, {
        shares: sharesWei,
        receiver: egress,
        maxFeeZen: maxFee,
        relayer: feeRelayer,
        user: account,
        deadline,
      });
      setPhase("relaying");
      push({ id: TOAST_ID, tone: "pending", message: copy.redeemToBase.relayingRedeem });
      const relayer = createRelayer(config);
      const handle = await relayer.submit({
        kind: "redeemAndCredit",
        chainId: HUB_CHAIN_ID,
        verifyingContract: egress,
        user: account,
        receiver: egress,
        amount: sharesWei.toString(),
        maxFeeZen: maxFee.toString(),
        relayer: feeRelayer,
        deadline: Number(deadline),
        signature,
      });
      const result = await waitRelay(handle);
      setRedeemTxHash(result.txHash);
      const feeZen = BigInt(result.feeZen ?? "0");
      const preview =
        previewAssets ??
        ((await readContract(config, {
          chainId: HUB_CHAIN_ID,
          address: stLighter,
          abi: abis.stLighter,
          functionName: "previewRedeem",
          args: [sharesWei],
        })) as bigint);
      const net = preview > feeZen ? preview - feeZen : 0n;
      setNetAssets(net);
      await queryClient.invalidateQueries();
      push({
        id: TOAST_ID,
        tone: "success",
        message: copy.redeemToBase.redeemConfirmed,
        explorerUrl: result.txHash ? explorerTxUrl(HUB_CHAIN_ID, result.txHash) : undefined,
      });
      setPhase("idle");
    } catch (err) {
      logTxError("redeemToBase.redeemAndCredit", err);
      setPhase("failed");
      const c =
        err instanceof FeeQuoteError ? { message: err.message } : classifyTxError(err);
      setError(c.message);
      push({ id: TOAST_ID, tone: "error", message: c.message });
    }
  }, [
    account,
    stLighter,
    egress,
    sharesWei,
    previewAssets,
    config,
    ensureHorizen,
    push,
    queryClient,
  ]);

  const relayBridge = useCallback(async () => {
    if (!account || !egress || !bridge || !effectiveDest) return;
    const assets = credited > 0n ? credited : netAssets;
    if (!assets || assets <= 0n) return;
    setError(undefined);
    setPhase("signing");
    push({ id: TOAST_ID, tone: "pending", message: copy.redeemToBase.signingBridge });
    try {
      await ensureHorizen();
      const feeRelayer = resolveGaslessFeeRelayer(account);
      const extraOptions = buildOftSendLzReceiveOptions();
      const quoteAssets = truncateOftAmountLD(assets, decimalConversionRate);
      if (quoteAssets <= 0n) {
        throw new Error("Amount too small after OFT dust truncation");
      }
      const quote = await fetchFeeQuote({
        kind: "bridgeToBase",
        amount: quoteAssets.toString(),
        dest: effectiveDest,
        extraOptions,
      });
      if (isQuoteExpired(quote)) {
        throw new FeeQuoteError("fee_quote_stale", copy.redeem.gaslessFeeStale);
      }
      const maxFee = BigInt(quote.maxFeeZen);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SEC);
      const { signature } = await signBridgeToBase(config, HUB_CHAIN_ID, egress, {
        assets,
        dest: effectiveDest,
        maxFeeZen: maxFee,
        relayer: feeRelayer,
        owner: account,
        deadline,
      });
      // Deployed Bridge quote may still require dust-free amount until upgrade; match send path.
      const nativeFee = (await readContract(config, {
        chainId: HUB_CHAIN_ID,
        address: bridge,
        abi: abis.zenOftStationBridge,
        functionName: "quoteBridgeNativeFee",
        args: [quoteAssets, effectiveDest, extraOptions],
      })) as bigint;

      if (baseZen) {
        const before = (await readContract(config, {
          chainId: SPOKE_CHAIN_ID,
          address: baseZen,
          abi: abis.zen,
          functionName: "balanceOf",
          args: [effectiveDest],
        })) as bigint;
        setBaseBalanceBefore(before);
      }

      setPhase("relaying");
      push({ id: TOAST_ID, tone: "pending", message: copy.redeemToBase.relayingBridge });
      const relayer = createRelayer(config);
      const handle = await relayer.submit({
        kind: "bridgeToBase",
        chainId: HUB_CHAIN_ID,
        verifyingContract: egress,
        user: account,
        receiver: effectiveDest,
        amount: assets.toString(),
        maxFeeZen: maxFee.toString(),
        relayer: feeRelayer,
        deadline: Number(deadline),
        signature,
        nativeValue: nativeFee.toString(),
        extraOptions,
      });
      const result = await waitRelay(handle);
      setBridgeTxHash(result.txHash);
      await queryClient.invalidateQueries();
      push({
        id: TOAST_ID,
        tone: "success",
        message: copy.redeemToBase.bridgeSent,
        explorerUrl: result.txHash ? explorerTxUrl(HUB_CHAIN_ID, result.txHash) : undefined,
      });
      setPhase("waiting");
    } catch (err) {
      logTxError("redeemToBase.bridge", err);
      setPhase("failed");
      const c =
        err instanceof FeeQuoteError ? { message: err.message } : classifyTxError(err);
      setError(c.message);
      push({ id: TOAST_ID, tone: "error", message: c.message });
    }
  }, [
    account,
    egress,
    bridge,
    effectiveDest,
    credited,
    netAssets,
    baseZen,
    config,
    ensureHorizen,
    push,
    queryClient,
    decimalConversionRate,
  ]);

  const withdrawCredit = useCallback(async () => {
    if (!account || !egress || credited <= 0n) return;
    setError(undefined);
    setPhase("withdrawing");
    push({ id: TOAST_ID, tone: "pending", message: copy.redeemToBase.signingWithdraw });
    try {
      await ensureHorizen();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SEC);
      const { signature } = await signEgressWithdrawToHorizen(config, HUB_CHAIN_ID, egress, {
        assets: credited,
        to: account,
        owner: account,
        deadline,
      });
      const relayer = createDirectRelayer(config);
      const handle = await relayer.submit({
        kind: "egressWithdrawToHorizen",
        chainId: HUB_CHAIN_ID,
        verifyingContract: egress,
        user: account,
        receiver: account,
        amount: credited.toString(),
        maxFeeZen: "0",
        // EIP-712 WithdrawToHorizen does not bind relayer; placeholder for RelayRequest shape.
        relayer: account,
        deadline: Number(deadline),
        signature,
      });
      const result = await waitRelay(handle);
      await queryClient.invalidateQueries();
      push({
        id: TOAST_ID,
        tone: "success",
        message: copy.redeemToBase.withdrawConfirmed,
        explorerUrl: result.txHash ? explorerTxUrl(HUB_CHAIN_ID, result.txHash) : undefined,
      });
      setPhase("idle");
      setNetAssets(undefined);
      setRedeemTxHash(undefined);
      setBridgeTxHash(undefined);
      setDestConfirmed(false);
    } catch (err) {
      logTxError("redeemToBase.withdraw", err);
      setPhase("failed");
      const c = classifyTxError(err);
      setError(c.message);
      push({ id: TOAST_ID, tone: "error", message: c.message });
    }
  }, [account, egress, credited, config, ensureHorizen, push, queryClient]);

  const startOver = useCallback(() => {
    setSharesWei(undefined);
    setDest(undefined);
    setDestConfirmed(false);
    setPhase("idle");
    setNetAssets(undefined);
    setRedeemTxHash(undefined);
    setBridgeTxHash(undefined);
    setBaseBalanceBefore(undefined);
    setError(undefined);
  }, []);

  const busy =
    phase === "signing" ||
    phase === "relaying" ||
    phase === "withdrawing" ||
    phase === "waiting";

  return {
    isConfigured,
    chainId,
    account,
    step,
    phase,
    busy,
    error,
    sharesWei,
    setSharesWei,
    ltBalance,
    previewAssets,
    previewBaseReceive,
    maxFeeZen,
    redeemFeeQuote,
    bridgeFeeQuote,
    decimalConversionRate,
    dest: effectiveDest,
    setDest,
    destConfirmed,
    confirmDest,
    credited,
    creditedBaseReceive,
    netAssets,
    redeemTxHash,
    bridgeTxHash,
    baseZenBalance,
    relayRedeemAndCredit,
    relayBridge,
    withdrawCredit,
    startOver,
    markDone: () => setPhase("confirmed"),
  };
}

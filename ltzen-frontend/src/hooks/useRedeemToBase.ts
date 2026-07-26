"use client";

/**
 * Redeem to Base (Wave B):
 * Horizen ltZEN → redeemWithSig(receiver=Egress) → creditFromRedeem → bridgeToBase → Base ZEN @ B1.
 * L3 legs go through createRelayer() (BFF+rrelayer when configured).
 *
 * Credit is signed *after* redeem confirms so net assets match the relayer feeZen.
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
import { copy } from "@/lib/copy";
import { classifyTxError, logTxError } from "@/lib/errors";
import {
  signBridgeToBase,
  signCreditFromRedeem,
  signEgressWithdrawToHorizen,
  signRedeemWithSig,
} from "@/lib/eip712";
import { buildOftSendLzReceiveOptions } from "@/lib/stationCompose";
import { createRelayer, type RelayResult } from "@/relayer";
import { useToast } from "@/components/common/Toast";

const SIG_TTL_SEC = 30 * 60;
const MAX_FEE_BPS = 100n;
const TOAST_ID = "redeem-to-base";

export type RedeemToBaseStep =
  | "configure"
  | "amount"
  | "confirm-dest"
  | "redeem"
  | "credit"
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
  const [creditTxHash, setCreditTxHash] = useState<Hex | undefined>();
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

  const maxFeeZen = useMemo(() => {
    if (previewAssets === undefined) return undefined;
    return (previewAssets * MAX_FEE_BPS) / 10_000n;
  }, [previewAssets]);

  const baseArrived = useMemo(() => {
    if (baseBalanceBefore === undefined || baseZenBalance === undefined) return false;
    return baseZenBalance > baseBalanceBefore;
  }, [baseBalanceBefore, baseZenBalance]);

  const step: RedeemToBaseStep = useMemo(() => {
    if (!isConfigured) return "configure";
    if (phase === "confirmed" || baseArrived) return "done";
    if (bridgeTxHash && phase === "waiting") return "wait-base";
    if (credited > 0n) {
      if (bridgeTxHash) return "wait-base";
      return "bridge";
    }
    if (redeemTxHash && credited === 0n) return "credit";
    if (destConfirmed && sharesWei) return "redeem";
    if (sharesWei) return "confirm-dest";
    return "amount";
  }, [
    isConfigured,
    phase,
    baseArrived,
    bridgeTxHash,
    credited,
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

  const relayRedeem = useCallback(async () => {
    if (!account || !stLighter || !egress || !sharesWei || maxFeeZen === undefined) return;
    setError(undefined);
    setPhase("signing");
    push({ id: TOAST_ID, tone: "pending", message: copy.redeemToBase.signingRedeem });
    try {
      await ensureHorizen();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SEC);
      const { signature } = await signRedeemWithSig(config, HUB_CHAIN_ID, stLighter, {
        shares: sharesWei,
        receiver: egress,
        maxFeeZen,
        user: account,
        deadline,
      });
      setPhase("relaying");
      push({ id: TOAST_ID, tone: "pending", message: copy.redeemToBase.relayingRedeem });
      const relayer = createRelayer(config);
      const handle = await relayer.submit({
        kind: "redeemWithSig",
        chainId: HUB_CHAIN_ID,
        verifyingContract: stLighter,
        user: account,
        receiver: egress,
        amount: sharesWei.toString(),
        maxFeeZen: maxFeeZen.toString(),
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
      logTxError("redeemToBase.redeem", err);
      setPhase("failed");
      const c = classifyTxError(err);
      setError(c.message);
      push({ id: TOAST_ID, tone: "error", message: c.message });
    }
  }, [
    account,
    stLighter,
    egress,
    sharesWei,
    maxFeeZen,
    previewAssets,
    config,
    ensureHorizen,
    push,
    queryClient,
  ]);

  const relayCredit = useCallback(async () => {
    if (!account || !egress) return;
    setError(undefined);
    setPhase("signing");
    push({ id: TOAST_ID, tone: "pending", message: copy.redeemToBase.signingCredit });
    try {
      await ensureHorizen();
      const float = (await readContract(config, {
        chainId: HUB_CHAIN_ID,
        address: egress,
        abi: abis.egressStation,
        functionName: "float",
      })) as bigint;
      const assets = netAssets && netAssets > 0n && netAssets <= float ? netAssets : float;
      if (assets <= 0n) throw new Error("No redeem float to credit");
      setNetAssets(assets);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SEC);
      const { signature } = await signCreditFromRedeem(config, HUB_CHAIN_ID, egress, {
        assets,
        owner: account,
        deadline,
      });
      setPhase("relaying");
      push({ id: TOAST_ID, tone: "pending", message: copy.redeemToBase.relayingCredit });
      const relayer = createRelayer(config);
      const handle = await relayer.submit({
        kind: "creditFromRedeem",
        chainId: HUB_CHAIN_ID,
        verifyingContract: egress,
        user: account,
        receiver: account,
        amount: assets.toString(),
        maxFeeZen: "0",
        deadline: Number(deadline),
        signature,
      });
      const result = await waitRelay(handle);
      setCreditTxHash(result.txHash);
      await queryClient.invalidateQueries();
      push({
        id: TOAST_ID,
        tone: "success",
        message: copy.redeemToBase.creditConfirmed,
        explorerUrl: result.txHash ? explorerTxUrl(HUB_CHAIN_ID, result.txHash) : undefined,
      });
      setPhase("idle");
    } catch (err) {
      logTxError("redeemToBase.credit", err);
      setPhase("failed");
      const c = classifyTxError(err);
      setError(c.message);
      push({ id: TOAST_ID, tone: "error", message: c.message });
    }
  }, [account, egress, netAssets, config, ensureHorizen, push, queryClient]);

  const relayBridge = useCallback(async () => {
    if (!account || !egress || !bridge || !effectiveDest) return;
    const assets = credited > 0n ? credited : netAssets;
    if (!assets || assets <= 0n) return;
    setError(undefined);
    setPhase("signing");
    push({ id: TOAST_ID, tone: "pending", message: copy.redeemToBase.signingBridge });
    try {
      await ensureHorizen();
      const maxFee = (assets * MAX_FEE_BPS) / 10_000n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SEC);
      const { signature } = await signBridgeToBase(config, HUB_CHAIN_ID, egress, {
        assets,
        dest: effectiveDest,
        maxFeeZen: maxFee,
        owner: account,
        deadline,
      });
      const extraOptions = buildOftSendLzReceiveOptions();
      const bridgeAmount = assets; // feeZen applied by BFF; Direct uses 0
      const nativeFee = (await readContract(config, {
        chainId: HUB_CHAIN_ID,
        address: bridge,
        abi: abis.zenOftStationBridge,
        functionName: "quoteBridgeNativeFee",
        args: [bridgeAmount, effectiveDest, extraOptions],
      })) as bigint;

      // Snapshot Base balance before bridge for wait detection.
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
      const c = classifyTxError(err);
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
      const relayer = createRelayer(config);
      const handle = await relayer.submit({
        kind: "egressWithdrawToHorizen",
        chainId: HUB_CHAIN_ID,
        verifyingContract: egress,
        user: account,
        receiver: account,
        amount: credited.toString(),
        maxFeeZen: "0",
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
      setCreditTxHash(undefined);
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
    setCreditTxHash(undefined);
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
    maxFeeZen,
    dest: effectiveDest,
    setDest,
    destConfirmed,
    confirmDest,
    credited,
    netAssets,
    redeemTxHash,
    creditTxHash,
    bridgeTxHash,
    baseZenBalance,
    relayRedeem,
    relayCredit,
    relayBridge,
    withdrawCredit,
    startOver,
    markDone: () => setPhase("confirmed"),
  };
}

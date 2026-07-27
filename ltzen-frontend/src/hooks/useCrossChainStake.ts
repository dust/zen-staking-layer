"use client";

/**
 * Cross-chain stake semi-orchestration:
 * Base ERC20 ZEN → approve ZenTokenOFTAdapter → adapter.send(+compose) →
 * InboundStation credit → StLighter.depositWithSig(payer=Station).
 * Steps are independent and resumable from `credited` on Horizen.
 */

import { useCallback, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useConfig,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import {
  getAccount,
  readContract,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { HUB_CHAIN_ID, SPOKE_CHAIN_ID, base, horizen } from "@/config/chains";
import {
  abis,
  baseAddress,
  crossChainStakeConfigured,
  horizenAddress,
  layerZeroEids,
} from "@/config/contracts";
import { copy } from "@/lib/copy";
import { classifyTxError, logTxError } from "@/lib/errors";
import {
  signCreditFromCompose,
  signDepositWithSig,
  signWithdrawToHorizen,
} from "@/lib/eip712";
import {
  addressToBytes32,
  buildOftSendComposeOptions,
  encodeStationComposePayloadV1,
} from "@/lib/stationCompose";
import { resolveGaslessFeeRelayer } from "@/config/relayer";
import { createRelayer, type RelayResult } from "@/relayer";
import { useToast } from "@/components/common/Toast";

const SIG_TTL_SEC = 30 * 60;
const MAX_FEE_BPS = 100n;
const TOAST_ID = "cross-chain-stake";

function asMessagingFee(fee: unknown): { nativeFee: bigint; lzTokenFee: bigint } {
  if (Array.isArray(fee) && fee.length >= 2) {
    return { nativeFee: BigInt(fee[0] as bigint), lzTokenFee: BigInt(fee[1] as bigint) };
  }
  const f = fee as { nativeFee?: bigint; lzTokenFee?: bigint };
  if (f?.nativeFee === undefined) {
    throw new Error(`quoteSend returned unexpected fee shape: ${JSON.stringify(fee, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    )}`);
  }
  return { nativeFee: BigInt(f.nativeFee), lzTokenFee: BigInt(f.lzTokenFee ?? 0n) };
}

export type CrossStakeStep =
  | "configure"
  | "amount"
  | "sign-credit"
  | "bridge"
  | "wait-credit"
  | "sign-stake"
  | "done";

export type CrossStakePhase =
  | "idle"
  | "signing"
  | "approving"
  | "bridging"
  | "waiting"
  | "staking"
  | "withdrawing"
  | "confirmed"
  | "failed";

function explorerTxUrl(chainId: number, hash: Hex): string | undefined {
  const chain = chainId === SPOKE_CHAIN_ID ? base : horizen;
  const baseUrl = chain.blockExplorers?.default?.url;
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}/tx/${hash}` : undefined;
}

export function useCrossChainStake() {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const config = useConfig();
  const queryClient = useQueryClient();
  const { switchChainAsync } = useSwitchChain();
  const { push } = useToast();

  const inboundStation = horizenAddress("inboundStation");
  const stLighter = horizenAddress("stLighter");
  const baseZen = baseAddress("zen");
  const baseZenOftAdapter = baseAddress("zenOftAdapter");
  const dstEid = layerZeroEids.horizen;
  const isConfigured = crossChainStakeConfigured();

  const [amountWei, setAmountWei] = useState<bigint | undefined>();
  const [phase, setPhase] = useState<CrossStakePhase>("idle");
  const [creditSig, setCreditSig] = useState<Hex | undefined>();
  const [creditNonce, setCreditNonce] = useState<bigint | undefined>();
  const [creditDeadline, setCreditDeadline] = useState<bigint | undefined>();
  const [bridgeTxHash, setBridgeTxHash] = useState<Hex | undefined>();
  const [stakeTxHash, setStakeTxHash] = useState<Hex | undefined>();
  const [error, setError] = useState<string | undefined>();

  const balanceQuery = useReadContract({
    chainId: SPOKE_CHAIN_ID,
    address: baseZen,
    abi: abis.zen,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: Boolean(account && baseZen), refetchInterval: 8_000 },
  });
  const baseBalance = balanceQuery.data as bigint | undefined;

  const allowanceQuery = useReadContract({
    chainId: SPOKE_CHAIN_ID,
    address: baseZen,
    abi: abis.zen,
    functionName: "allowance",
    args: account && baseZenOftAdapter ? [account, baseZenOftAdapter] : undefined,
    query: {
      enabled: Boolean(account && baseZen && baseZenOftAdapter),
      refetchInterval: 8_000,
    },
  });
  const allowance = allowanceQuery.data as bigint | undefined;

  const needsApproval = useMemo(() => {
    if (amountWei === undefined || allowance === undefined) return false;
    return allowance < amountWei;
  }, [amountWei, allowance]);

  const creditedQuery = useReadContract({
    chainId: HUB_CHAIN_ID,
    address: inboundStation,
    abi: abis.inboundStation,
    functionName: "credited",
    args: account ? [account] : undefined,
    query: {
      enabled: Boolean(account && inboundStation),
      refetchInterval: 5_000,
    },
  });
  const credited = (creditedQuery.data as bigint | undefined) ?? 0n;

  const step: CrossStakeStep = useMemo(() => {
    if (!isConfigured) return "configure";
    if (phase === "confirmed") return "done";
    if (credited > 0n) {
      if (phase === "staking" || phase === "signing") return "sign-stake";
      return "sign-stake";
    }
    if (bridgeTxHash && phase !== "failed") return "wait-credit";
    if (creditSig && creditNonce !== undefined && creditDeadline) return "bridge";
    if (amountWei) return "sign-credit";
    return "amount";
  }, [
    isConfigured,
    credited,
    phase,
    bridgeTxHash,
    creditSig,
    creditNonce,
    creditDeadline,
    amountWei,
  ]);

  const ensureBase = useCallback(async () => {
    const active = getAccount(config).chainId;
    if (active !== SPOKE_CHAIN_ID) {
      await switchChainAsync({ chainId: SPOKE_CHAIN_ID });
    }
  }, [config, switchChainAsync]);

  const ensureHorizen = useCallback(async () => {
    const active = getAccount(config).chainId;
    if (active !== HUB_CHAIN_ID) {
      await switchChainAsync({ chainId: HUB_CHAIN_ID });
    }
  }, [config, switchChainAsync]);

  const signCredit = useCallback(
    async (assetsOverride?: bigint) => {
      const assets = assetsOverride ?? amountWei;
      if (!account || !inboundStation || !assets) return;
      setAmountWei(assets);
      setError(undefined);
      setPhase("signing");
      push({ id: TOAST_ID, tone: "pending", message: copy.crossStake.signingCredit });
      try {
        // MetaMask requires wallet active chainId == EIP-712 domain.chainId (Horizen).
        await ensureHorizen();
        const deadline = BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SEC);
        const { signature, nonce } = await signCreditFromCompose(
          config,
          HUB_CHAIN_ID,
          inboundStation,
          { assets, owner: account, deadline },
        );
        setCreditSig(signature);
        setCreditNonce(nonce);
        setCreditDeadline(deadline);
        // Next step is Base approve/send — switch back so bridge doesn't need a second prompt later.
        await ensureBase();
        setPhase("idle");
        push({ id: TOAST_ID, tone: "success", message: copy.crossStake.creditSigned });
      } catch (err) {
        setPhase("failed");
        logTxError("signCredit", err);
        const c = classifyTxError(err);
        setError(c.message);
        push({ id: TOAST_ID, tone: "error", message: c.message });
      }
    },
    [account, amountWei, config, ensureBase, ensureHorizen, inboundStation, push],
  );

  const bridgeFromBase = useCallback(async () => {
    const missing: string[] = [];
    if (!account) missing.push("wallet");
    if (!inboundStation) missing.push("InboundStation");
    if (!baseZen) missing.push("Base ZEN");
    if (!baseZenOftAdapter) missing.push("ZenTokenOFTAdapter");
    if (!amountWei) missing.push("amount");
    if (!creditSig || creditNonce === undefined || !creditDeadline) {
      missing.push("credit signature");
    }
    if (!dstEid) missing.push("NEXT_PUBLIC_HORIZEN_EID");
    if (missing.length > 0) {
      const message = `Cannot bridge — missing: ${missing.join(", ")}`;
      console.error("[ltZEN:bridgeFromBase]", message, {
        account,
        inboundStation,
        baseZen,
        baseZenOftAdapter,
        amountWei: amountWei?.toString(),
        hasCreditSig: Boolean(creditSig),
        creditDeadline: creditDeadline?.toString(),
        dstEid,
      });
      setError(message);
      push({ id: TOAST_ID, tone: "error", message });
      return;
    }

    setError(undefined);
    try {
      await ensureBase();
      console.info("[ltZEN:bridgeFromBase] start", {
        amountWei: amountWei!.toString(),
        adapter: baseZenOftAdapter,
        zen: baseZen,
        toStation: inboundStation,
        dstEid,
        needsApproval,
      });

      if (needsApproval) {
        setPhase("approving");
        push({ id: TOAST_ID, tone: "pending", message: copy.crossStake.approvingAdapter });
        const approveHash = await writeContract(config, {
          chainId: SPOKE_CHAIN_ID,
          address: baseZen!,
          abi: abis.zen,
          functionName: "approve",
          args: [baseZenOftAdapter!, amountWei!],
        });
        await waitForTransactionReceipt(config, {
          hash: approveHash,
          chainId: SPOKE_CHAIN_ID,
        });
        await allowanceQuery.refetch();
        push({ id: TOAST_ID, tone: "success", message: copy.tx.approveConfirmed });
      }

      setPhase("bridging");
      push({ id: TOAST_ID, tone: "pending", message: copy.crossStake.bridging });
      const composeMsg = encodeStationComposePayloadV1({
        owner: account!,
        assets: amountWei!,
        nonce: creditNonce!,
        deadline: creditDeadline!,
        signature: creditSig!,
      });
      const extraOptions = buildOftSendComposeOptions();
      const sendParam = {
        dstEid: dstEid!,
        to: addressToBytes32(inboundStation!),
        amountLD: amountWei!,
        minAmountLD: amountWei!,
        extraOptions,
        composeMsg,
        oftCmd: "0x" as Hex,
      };
      console.info("[ltZEN:bridgeFromBase] quoteSend", {
        dstEid: sendParam.dstEid,
        to: sendParam.to,
        amountLD: sendParam.amountLD.toString(),
        composeMsgLen: (composeMsg.length - 2) / 2,
        extraOptions,
      });

      const feeRaw = await readContract(config, {
        chainId: SPOKE_CHAIN_ID,
        address: baseZenOftAdapter!,
        abi: abis.zenOft,
        functionName: "quoteSend",
        args: [sendParam, false],
      });
      const fee = asMessagingFee(feeRaw);
      console.info("[ltZEN:bridgeFromBase] fee", {
        nativeFee: fee.nativeFee.toString(),
        lzTokenFee: fee.lzTokenFee.toString(),
      });

      const hash = await writeContract(config, {
        chainId: SPOKE_CHAIN_ID,
        address: baseZenOftAdapter!,
        abi: abis.zenOft,
        functionName: "send",
        args: [sendParam, fee, account!],
        value: fee.nativeFee,
      });
      await waitForTransactionReceipt(config, { hash, chainId: SPOKE_CHAIN_ID });
      setBridgeTxHash(hash);
      setPhase("waiting");
      push({
        id: TOAST_ID,
        tone: "success",
        message: copy.crossStake.bridgeSent,
        explorerUrl: explorerTxUrl(SPOKE_CHAIN_ID, hash),
      });
      void queryClient.invalidateQueries();
    } catch (err) {
      setPhase("failed");
      logTxError("bridgeFromBase", err);
      const c = classifyTxError(err);
      setError(c.message);
      push({ id: TOAST_ID, tone: "error", message: c.message });
    }
  }, [
    account,
    amountWei,
    allowanceQuery,
    baseZen,
    baseZenOftAdapter,
    config,
    creditDeadline,
    creditNonce,
    creditSig,
    dstEid,
    ensureBase,
    inboundStation,
    needsApproval,
    push,
    queryClient,
  ]);

  const stakeFromCredit = useCallback(async () => {
    if (!account || !inboundStation || !stLighter) return;
    const assets = credited > 0n ? credited : amountWei;
    if (!assets || assets <= 0n) return;

    setError(undefined);
    setPhase("staking");
    push({ id: TOAST_ID, tone: "pending", message: copy.crossStake.signingStake });
    try {
      await ensureHorizen();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SEC);
      const maxFeeZen = (assets * MAX_FEE_BPS) / 10_000n;
      const feeRelayer = resolveGaslessFeeRelayer(account);
      const { signature } = await signDepositWithSig(config, HUB_CHAIN_ID, stLighter, {
        assets,
        receiver: account,
        maxFeeZen,
        payer: inboundStation,
        relayer: feeRelayer,
        user: account,
        deadline,
      });

      push({ id: TOAST_ID, tone: "pending", message: copy.crossStake.relayingStake });
      const relayer = createRelayer(config);
      const handle = await relayer.submit({
        kind: "depositWithSig",
        chainId: HUB_CHAIN_ID,
        verifyingContract: stLighter,
        user: account,
        receiver: account,
        amount: assets.toString(),
        maxFeeZen: maxFeeZen.toString(),
        relayer: feeRelayer,
        deadline: Number(deadline),
        signature,
        payer: inboundStation,
      });

      await new Promise<void>((resolve, reject) => {
        const unsub = handle.subscribe((r: RelayResult) => {
          if (r.status === "confirmed") {
            setStakeTxHash(r.txHash);
            setPhase("confirmed");
            push({
              id: TOAST_ID,
              tone: "success",
              message: copy.crossStake.stakeConfirmed,
              explorerUrl: r.txHash ? explorerTxUrl(HUB_CHAIN_ID, r.txHash) : undefined,
            });
            void queryClient.invalidateQueries();
            unsub();
            resolve();
          }
          if (r.status === "failed" || r.status === "timeout") {
            setPhase("failed");
            setError(r.error ?? copy.errors.relayerTimeout);
            push({
              id: TOAST_ID,
              tone: "error",
              message: r.error ?? copy.errors.relayerTimeout,
            });
            unsub();
            reject(new Error(r.error ?? "relay failed"));
          }
        });
      });
    } catch (err) {
      setPhase("failed");
      const c = classifyTxError(err);
      setError(c.message);
      push({ id: TOAST_ID, tone: "error", message: c.message });
    }
  }, [
    account,
    amountWei,
    config,
    credited,
    ensureHorizen,
    inboundStation,
    push,
    queryClient,
    stLighter,
  ]);

  const withdrawCredit = useCallback(async () => {
    if (!account || !inboundStation || credited <= 0n) return;
    setError(undefined);
    setPhase("withdrawing");
    push({ id: TOAST_ID, tone: "pending", message: copy.crossStake.signingWithdraw });
    try {
      await ensureHorizen();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + SIG_TTL_SEC);
      const { signature } = await signWithdrawToHorizen(
        config,
        HUB_CHAIN_ID,
        inboundStation,
        { assets: credited, to: account, owner: account, deadline },
      );
      const relayer = createRelayer(config);
      const handle = await relayer.submit({
        kind: "withdrawToHorizen",
        chainId: HUB_CHAIN_ID,
        verifyingContract: inboundStation,
        user: account,
        receiver: account,
        amount: credited.toString(),
        maxFeeZen: "0",
        relayer: resolveGaslessFeeRelayer(account),
        deadline: Number(deadline),
        signature,
      });
      await new Promise<void>((resolve, reject) => {
        const unsub = handle.subscribe((r: RelayResult) => {
          if (r.status === "confirmed") {
            setPhase("idle");
            setBridgeTxHash(undefined);
            setCreditSig(undefined);
            setCreditDeadline(undefined);
            push({
              id: TOAST_ID,
              tone: "success",
              message: copy.crossStake.withdrawConfirmed,
              explorerUrl: r.txHash ? explorerTxUrl(HUB_CHAIN_ID, r.txHash) : undefined,
            });
            void queryClient.invalidateQueries();
            unsub();
            resolve();
          }
          if (r.status === "failed" || r.status === "timeout") {
            setPhase("failed");
            setError(r.error ?? copy.errors.unknown);
            push({ id: TOAST_ID, tone: "error", message: r.error ?? copy.errors.unknown });
            unsub();
            reject(new Error(r.error ?? "withdraw failed"));
          }
        });
      });
    } catch (err) {
      setPhase("failed");
      const c = classifyTxError(err);
      setError(c.message);
      push({ id: TOAST_ID, tone: "error", message: c.message });
    }
  }, [account, config, credited, ensureHorizen, inboundStation, push, queryClient]);

  const reset = useCallback(() => {
    setAmountWei(undefined);
    setPhase("idle");
    setCreditSig(undefined);
    setCreditNonce(undefined);
    setCreditDeadline(undefined);
    setBridgeTxHash(undefined);
    setStakeTxHash(undefined);
    setError(undefined);
  }, []);

  return {
    account: account as Address | undefined,
    chainId,
    isConfigured,
    step,
    phase,
    amountWei,
    setAmountWei,
    baseBalance,
    needsApproval,
    credited,
    creditSig,
    bridgeTxHash,
    stakeTxHash,
    error,
    busy:
      phase === "signing" ||
      phase === "approving" ||
      phase === "bridging" ||
      phase === "staking" ||
      phase === "withdrawing",
    onBase: chainId === SPOKE_CHAIN_ID,
    onHorizen: chainId === HUB_CHAIN_ID,
    ensureBase,
    ensureHorizen,
    signCredit,
    bridgeFromBase,
    stakeFromCredit,
    withdrawCredit,
    reset,
    refetchCredit: () => creditedQuery.refetch(),
  };
}

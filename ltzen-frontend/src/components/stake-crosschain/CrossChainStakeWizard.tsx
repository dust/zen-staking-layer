"use client";

/**
 * CrossChainStakeWizard — Base ERC20 ZEN → OFTAdapter → InboundStation →
 * StLighter.depositWithSig (payer=Station).
 */

import { useMemo, useState } from "react";
import { parseEther } from "viem";
import { useAccount, useChainId } from "wagmi";
import {
  useCrossChainStake,
  type CrossStakeStep,
} from "@/hooks/useCrossChainStake";
import { BASE_SEPOLIA_CHAIN_ID, IS_TESTNET_ENV } from "@/config/chains";
import { isActionAvailable } from "@/lib/chainGating";
import { copy } from "@/lib/copy";
import { formatZen, formatZenAmount } from "@/lib/format";
import { Card } from "@/components/common/Card";
import { ChainGuide } from "@/components/common/ChainGuide";
import { GaslessFeePanel } from "@/components/common/GaslessFeePanel";
import { FaucetButton } from "@/components/stake/FaucetButton";

function parseAmount(input: string): bigint | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (!/^\d*\.?\d*$/.test(trimmed)) return undefined;
  try {
    const wei = parseEther(trimmed as `${number}`);
    return wei > 0n ? wei : undefined;
  } catch {
    return undefined;
  }
}

const STEP_ORDER: CrossStakeStep[] = [
  "amount",
  "sign-credit",
  "bridge",
  "wait-credit",
  "sign-stake",
  "done",
];

const STEP_LABEL: Record<string, string> = {
  amount: copy.crossStake.stepAmount,
  "sign-credit": copy.crossStake.stepSignCredit,
  bridge: copy.crossStake.stepBridge,
  "wait-credit": copy.crossStake.stepWait,
  "sign-stake": copy.crossStake.stepStake,
  done: copy.crossStake.stepDone,
};

function ProgressStrip({ step }: { step: CrossStakeStep }) {
  const activeIdx = STEP_ORDER.indexOf(step);
  return (
    <ol className="mt-4 flex flex-wrap gap-2" aria-label={copy.crossStake.progressLabel}>
      {STEP_ORDER.map((s, i) => {
        const done = activeIdx > i || step === "done";
        const current = activeIdx === i && step !== "done";
        return (
          <li
            key={s}
            className={`rounded-md px-2 py-1 text-[11px] ${
              current
                ? "bg-brand-green/20 text-brand-green"
                : done
                  ? "bg-white/10 text-zinc-300"
                  : "bg-white/[0.03] text-zinc-600"
            }`}
          >
            {i + 1}. {STEP_LABEL[s]}
          </li>
        );
      })}
    </ol>
  );
}

export function CrossChainStakeWizard() {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const x = useCrossChainStake();
  const [input, setInput] = useState("");

  const amountWei = useMemo(() => parseAmount(input), [input]);
  const available = isActionAvailable("crossChainStake", chainId);
  const showFaucetButton =
    IS_TESTNET_ENV &&
    chainId === BASE_SEPOLIA_CHAIN_ID &&
    (x.step === "amount" || x.step === "sign-credit") &&
    x.credited === 0n;

  if (!x.isConfigured) {
    return (
      <Card className="max-w-xl border-amber-400/20 bg-amber-400/[0.04]">
        <h1 className="font-display text-xl font-bold tracking-tight text-white">
          {copy.crossStake.title}
        </h1>
        <p className="mt-2 text-sm text-amber-100/90">{copy.crossStake.notConfigured}</p>
      </Card>
    );
  }

  // On Horizen with no credit yet: show guide. With credit, allow stake/withdraw without forcing Base.
  if (!available && x.credited === 0n) {
    return <ChainGuide action="crossChainStake" />;
  }

  const onMax = () => {
    if (x.baseBalance !== undefined) {
      const s = formatZen(x.baseBalance, 18).replace(/,/g, "");
      setInput(s);
      x.setAmountWei(parseAmount(s));
    }
  };

  const canPrimary =
    isConnected &&
    !x.busy &&
    (x.step === "done" ||
      x.step === "wait-credit" ||
      x.step === "bridge" ||
      x.step === "sign-stake" ||
      ((x.step === "amount" || x.step === "sign-credit") && Boolean(amountWei ?? x.amountWei)));

  const primaryLabel =
    x.step === "amount" || x.step === "sign-credit"
      ? x.phase === "signing"
        ? copy.crossStake.signingCredit
        : copy.crossStake.continueSignCredit
      : x.step === "bridge"
        ? x.phase === "approving"
          ? copy.crossStake.approvingAdapter
          : x.phase === "bridging"
            ? copy.crossStake.bridging
            : x.needsApproval
              ? copy.crossStake.continueApprove
              : copy.crossStake.continueBridge
        : x.step === "wait-credit"
          ? copy.crossStake.continueWait
          : x.step === "sign-stake"
            ? x.phase === "staking"
              ? copy.crossStake.relayingStake
              : copy.crossStake.continueStake
            : x.step === "done"
              ? copy.crossStake.startOver
              : copy.crossStake.continueSignCredit;

  const onPrimary = async () => {
    try {
      if (x.step === "amount" || x.step === "sign-credit") {
        const assets = amountWei ?? x.amountWei;
        if (!assets) return;
        await x.signCredit(assets);
      } else if (x.step === "bridge") {
        await x.ensureBase();
        await x.bridgeFromBase();
      } else if (x.step === "wait-credit") {
        await x.refetchCredit();
      } else if (x.step === "sign-stake") {
        await x.stakeFromCredit();
      } else if (x.step === "done") {
        x.reset();
        setInput("");
      }
    } catch {
      /* toasted in hook */
    }
  };

  return (
    <Card className="max-w-xl">
      <h1 className="font-display text-xl font-bold tracking-tight text-white">
        {copy.crossStake.title}
      </h1>
      <p className="mt-1 text-sm text-zinc-400">{copy.crossStake.subtitle}</p>

      {showFaucetButton ? (
        <div className="mt-4">
          <FaucetButton />
        </div>
      ) : null}

      <ProgressStrip step={x.step === "configure" ? "amount" : x.step} />

      {x.credited > 0n ? (
        <div className="mt-4 rounded-lg border border-brand-green/20 bg-brand-green/[0.06] px-3 py-2 text-sm text-zinc-200">
          {copy.crossStake.creditedLabel}:{" "}
          <span className="font-mono text-brand-green">
            {formatZenAmount(x.credited, 4)} {copy.units.zen}
          </span>
        </div>
      ) : null}

      {(x.step === "amount" || x.step === "sign-credit") && x.credited === 0n ? (
        <div className="mt-5">
          <div className="flex items-center justify-between text-sm text-zinc-400">
            <span>{copy.crossStake.amountLabel}</span>
            <span>
              {copy.crossStake.balance}:{" "}
              {x.baseBalance !== undefined ? formatZenAmount(x.baseBalance, 4) : "—"}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.02] px-3 py-2.5 focus-within:border-brand-green/50">
            <input
              inputMode="decimal"
              placeholder="0.0"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                x.setAmountWei(parseAmount(e.target.value));
              }}
              className="w-full bg-transparent font-mono text-lg text-white outline-none placeholder:text-zinc-600"
              aria-label={copy.crossStake.amountLabel}
            />
            <span className="text-sm text-zinc-500">{copy.units.zen}</span>
            <button
              type="button"
              onClick={onMax}
              disabled={x.baseBalance === undefined}
              className="min-h-9 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/15 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green"
            >
              {copy.cta.max}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">{copy.crossStake.creditNote}</p>
        </div>
      ) : null}

      {x.step === "bridge" ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-zinc-400">{copy.crossStake.bridgeNote}</p>
          {x.needsApproval ? (
            <p className="text-xs text-zinc-500">{copy.crossStake.approveNote}</p>
          ) : null}
        </div>
      ) : null}

      {x.step === "wait-credit" ? (
        <p className="mt-4 text-sm text-zinc-400">{copy.crossStake.waitNote}</p>
      ) : null}

      {(x.step === "sign-stake") && x.credited > 0n ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-zinc-400">{copy.crossStake.stakeNote}</p>
          <GaslessFeePanel
            quote={x.stakeFeeQuote.quote}
            error={x.stakeFeeQuote.error}
            loading={x.stakeFeeQuote.loading}
            grossAssets={x.credited}
            netLabel="You stake (after fee)"
          />
          <p className="text-xs text-zinc-500">{copy.crossStake.withdrawNote}</p>
          <button
            type="button"
            disabled={x.busy}
            onClick={() => void x.withdrawCredit()}
            className="text-sm font-medium text-amber-200/90 underline-offset-2 hover:underline disabled:opacity-50"
          >
            {x.phase === "withdrawing"
              ? copy.crossStake.signingWithdraw
              : copy.crossStake.withdrawCta}
          </button>
        </div>
      ) : null}

      {x.step === "done" ? (
        <p className="mt-4 text-sm text-brand-green">{copy.crossStake.stakeConfirmed}</p>
      ) : null}

      {x.error ? <p className="mt-3 text-sm text-red-300">{x.error}</p> : null}

      <button
        type="button"
        disabled={!canPrimary && isConnected}
        onClick={() => void onPrimary()}
        className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-cta px-4 text-sm font-semibold text-black transition-[filter] hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
      >
        {!isConnected ? copy.cta.connect : primaryLabel}
      </button>
    </Card>
  );
}

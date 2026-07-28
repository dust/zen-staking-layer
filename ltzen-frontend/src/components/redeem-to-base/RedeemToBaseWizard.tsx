"use client";

/**
 * RedeemToBaseWizard — Horizen ltZEN → Egress → Base ZEN @ B1 (Wave B).
 */

import { useMemo, useState } from "react";
import { parseEther, type Address } from "viem";
import { useAccount, useChainId } from "wagmi";
import {
  useRedeemToBase,
  type RedeemToBaseStep,
} from "@/hooks/useRedeemToBase";
import { isActionAvailable } from "@/lib/chainGating";
import { copy } from "@/lib/copy";
import { formatZen, formatZenAmount } from "@/lib/format";
import { Card } from "@/components/common/Card";
import { ChainGuide } from "@/components/common/ChainGuide";
import { GaslessFeePanel } from "@/components/common/GaslessFeePanel";

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

const STEP_ORDER: RedeemToBaseStep[] = [
  "amount",
  "confirm-dest",
  "redeem",
  "bridge",
  "wait-base",
  "done",
];

const STEP_LABEL: Record<string, string> = {
  amount: copy.redeemToBase.stepAmount,
  "confirm-dest": copy.redeemToBase.stepDest,
  redeem: copy.redeemToBase.stepRedeem,
  bridge: copy.redeemToBase.stepBridge,
  "wait-base": copy.redeemToBase.stepWait,
  done: copy.redeemToBase.stepDone,
};

function ProgressStrip({ step }: { step: RedeemToBaseStep }) {
  const activeIdx = STEP_ORDER.indexOf(step);
  return (
    <ol className="mt-4 flex flex-wrap gap-2" aria-label={copy.redeemToBase.progressLabel}>
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

export function RedeemToBaseWizard() {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const x = useRedeemToBase();
  const [input, setInput] = useState("");
  const [destInput, setDestInput] = useState("");

  const sharesWei = useMemo(() => parseAmount(input), [input]);
  const available = isActionAvailable("redeemToBase", chainId);

  if (!x.isConfigured) {
    return (
      <Card className="max-w-xl border-amber-400/20 bg-amber-400/[0.04]">
        <h1 className="font-display text-xl font-bold tracking-tight text-white">
          {copy.redeemToBase.title}
        </h1>
        <p className="mt-2 text-sm text-amber-100/90">{copy.redeemToBase.notConfigured}</p>
      </Card>
    );
  }

  if (!available && x.credited === 0n) {
    return <ChainGuide action="redeemToBase" />;
  }

  const onMax = () => {
    if (x.ltBalance !== undefined) {
      const s = formatZen(x.ltBalance, 18).replace(/,/g, "");
      setInput(s);
      x.setSharesWei(parseAmount(s));
    }
  };

  const primaryLabel =
    x.step === "amount"
      ? copy.redeemToBase.destConfirmCta
      : x.step === "confirm-dest"
        ? copy.redeemToBase.destConfirmCta
        : x.step === "redeem"
          ? x.phase === "signing"
            ? copy.redeemToBase.signingRedeem
            : x.phase === "relaying"
              ? copy.redeemToBase.relayingRedeem
              : copy.redeemToBase.continueRedeem
            : x.step === "bridge"
              ? x.phase === "signing"
                ? copy.redeemToBase.signingBridge
                : x.phase === "relaying"
                  ? copy.redeemToBase.relayingBridge
                  : copy.redeemToBase.continueBridge
              : x.step === "wait-base"
                ? copy.redeemToBase.continueWait
                : x.step === "done"
                  ? copy.redeemToBase.startOver
                  : copy.redeemToBase.continueRedeem;

  const canPrimary =
    isConnected &&
    !x.busy &&
    (x.step === "done" ||
      x.step === "wait-base" ||
      x.step === "redeem" ||
      x.step === "bridge" ||
      ((x.step === "amount" || x.step === "confirm-dest") &&
        Boolean(sharesWei ?? x.sharesWei)));

  const onPrimary = async () => {
    try {
      if (x.step === "amount" || x.step === "confirm-dest") {
        const shares = sharesWei ?? x.sharesWei;
        if (!shares) return;
        x.setSharesWei(shares);
        const dest = (destInput.trim() || x.dest || x.account) as Address | undefined;
        if (!dest) return;
        if (!destInput.trim() && x.account) setDestInput(x.account);
        x.confirmDest(dest);
      } else if (x.step === "redeem") {
        await x.relayRedeemAndCredit();
      } else if (x.step === "bridge") {
        await x.relayBridge();
      } else if (x.step === "wait-base") {
        x.markDone();
      } else if (x.step === "done") {
        x.startOver();
        setInput("");
        setDestInput("");
      }
    } catch {
      /* toasted in hook */
    }
  };

  return (
    <Card className="max-w-xl">
      <h1 className="font-display text-xl font-bold tracking-tight text-white">
        {copy.redeemToBase.title}
      </h1>
      <p className="mt-1 text-sm text-zinc-400">{copy.redeemToBase.subtitle}</p>

      <ProgressStrip step={x.step === "configure" ? "amount" : x.step} />

      {x.credited > 0n ? (
        <div className="mt-4 rounded-lg border border-brand-green/20 bg-brand-green/[0.06] px-3 py-2 text-sm text-zinc-200">
          {copy.redeemToBase.creditedLabel}:{" "}
          <span className="font-mono text-brand-green">
            {formatZenAmount(x.credited, 4)} {copy.units.zen}
          </span>
          {x.creditedBaseReceive !== undefined && x.creditedBaseReceive < x.credited ? (
            <p className="mt-1 text-xs text-zinc-400">
              {copy.redeemToBase.youReceiveEst}:{" "}
              <span className="font-mono text-zinc-200">
                {formatZenAmount(x.creditedBaseReceive, 6)}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {(x.step === "amount" || x.step === "confirm-dest") && x.credited === 0n ? (
        <div className="mt-5 space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm text-zinc-400">
              <span>{copy.redeemToBase.amountLabel}</span>
              <span>
                {copy.redeemToBase.holdings}:{" "}
                {x.ltBalance !== undefined ? formatZenAmount(x.ltBalance, 4) : "—"}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.02] px-3 py-2.5 focus-within:border-brand-green/50">
              <input
                inputMode="decimal"
                placeholder="0.0"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  x.setSharesWei(parseAmount(e.target.value));
                }}
                className="w-full bg-transparent font-mono text-lg text-white outline-none placeholder:text-zinc-600"
                aria-label={copy.redeemToBase.amountLabel}
              />
              <span className="text-sm text-zinc-500">{copy.units.ltZen}</span>
              <button
                type="button"
                onClick={onMax}
                disabled={x.ltBalance === undefined}
                className="min-h-9 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/15 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green"
              >
                {copy.cta.max}
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {copy.redeemToBase.youReceiveEst}:{" "}
              {x.previewBaseReceive !== undefined
                ? `${formatZenAmount(x.previewBaseReceive, 6)}`
                : "—"}
            </p>
          </div>

          <div>
            <label className="text-sm text-zinc-400" htmlFor="b1-dest">
              {copy.redeemToBase.destLabel}
            </label>
            <input
              id="b1-dest"
              value={destInput || x.dest || ""}
              onChange={(e) => {
                setDestInput(e.target.value);
                x.setDest(e.target.value as Address);
              }}
              placeholder={x.account ?? "0x…"}
              className="mt-1.5 w-full rounded-xl border border-white/[0.12] bg-white/[0.02] px-3 py-2.5 font-mono text-sm text-white outline-none placeholder:text-zinc-600 focus:border-brand-green/50"
            />
            <p className="mt-2 text-xs text-amber-100/80">{copy.redeemToBase.destNote}</p>
          </div>
        </div>
      ) : null}

      {x.step === "redeem" ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-zinc-400">{copy.redeemToBase.signingRedeem}</p>
          <GaslessFeePanel
            quote={x.redeemFeeQuote.quote}
            error={x.redeemFeeQuote.error}
            loading={x.redeemFeeQuote.loading}
            grossAssets={x.previewAssets}
          />
        </div>
      ) : null}

      {x.step === "bridge" ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-zinc-400">{copy.redeemToBase.recoverableNote}</p>
          <GaslessFeePanel
            quote={x.bridgeFeeQuote.quote}
            error={x.bridgeFeeQuote.error}
            loading={x.bridgeFeeQuote.loading}
            grossAssets={x.credited > 0n ? x.credited : x.netAssets}
            netLabel="Bridged (after fee, approx.)"
          />
          <button
            type="button"
            disabled={x.busy}
            onClick={() => void x.withdrawCredit()}
            className="text-sm font-medium text-amber-200/90 underline-offset-2 hover:underline disabled:opacity-50"
          >
            {x.phase === "withdrawing"
              ? copy.redeemToBase.signingWithdraw
              : copy.redeemToBase.withdrawCta}
          </button>
        </div>
      ) : null}

      {x.step === "wait-base" ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-zinc-400">{copy.redeemToBase.waitNote}</p>
          <p className="text-xs text-zinc-500">
            Base ZEN @ B1:{" "}
            {x.baseZenBalance !== undefined ? formatZenAmount(x.baseZenBalance, 4) : "—"}
          </p>
          <button
            type="button"
            disabled={x.busy}
            onClick={() => void x.withdrawCredit()}
            className="text-sm font-medium text-amber-200/90 underline-offset-2 hover:underline disabled:opacity-50"
          >
            {copy.redeemToBase.withdrawCta}
          </button>
        </div>
      ) : null}

      {x.step === "done" ? (
        <p className="mt-4 text-sm text-brand-green">{copy.redeemToBase.done}</p>
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

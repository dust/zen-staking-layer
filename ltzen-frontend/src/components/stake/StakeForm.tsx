"use client";

/**
 * StakeForm (uiux §4.1–4.3) — the deposit closure UI on Horizen.
 */

import { useMemo, useState } from "react";
import { parseEther } from "viem";
import { useDeposit } from "@/hooks/useDeposit";
import { gaslessSupported } from "@/relayer";
import { copy } from "@/lib/copy";
import { approx, formatShares, formatZen, formatZenAmount } from "@/lib/format";
import { horizen } from "@/config/chains";
import { Card } from "@/components/common/Card";
import { InfoTooltip } from "@/components/common/InfoTooltip";

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

function explorerTxUrl(hash: string): string | undefined {
  const base = horizen.blockExplorers?.default?.url;
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : undefined;
}

export function StakeForm() {
  const [input, setInput] = useState("");
  const [gasless, setGasless] = useState(false);

  const amountWei = useMemo(() => parseAmount(input), [input]);
  const d = useDeposit({ amountWei });

  const useGasless = gasless && gaslessSupported;

  const gaslessBusy =
    useGasless &&
    d.gaslessPhase !== "idle" &&
    d.gaslessPhase !== "confirmed" &&
    d.gaslessPhase !== "timeout" &&
    d.gaslessPhase !== "failed";

  const busy = d.isBusy || gaslessBusy;

  const canSubmit =
    Boolean(amountWei) &&
    d.isConnected &&
    d.isConfigured &&
    !d.insufficientBalance &&
    !busy;

  const onMax = () => {
    if (d.balance !== undefined) setInput(formatZen(d.balance, 18).replace(/,/g, ""));
  };

  const onSubmit = async () => {
    try {
      if (useGasless) await d.depositGasless();
      else await d.deposit();
      setInput("");
    } catch {
      /* classified + toasted inside hook */
    }
  };

  const buttonLabel = useGasless
    ? d.gaslessPhase === "signing-deposit"
      ? copy.stake.signingDeposit
      : d.gaslessPhase === "signing-permit"
        ? copy.stake.signingPermit
        : d.gaslessPhase === "submitting"
          ? copy.stake.submitting
          : d.gaslessPhase === "relaying"
            ? copy.stake.relayerWaiting
            : copy.cta.stake
    : d.state.phase === "awaiting-signature" || d.state.phase === "pending"
      ? d.needsApproval
        ? copy.cta.approving
        : copy.cta.depositing
      : d.needsApproval
        ? copy.cta.approve
        : copy.cta.stake;

  return (
    <Card className="max-w-xl">
      <h1 className="font-display text-xl font-bold tracking-tight text-white">{copy.stake.title}</h1>
      <p className="mt-1 text-sm text-zinc-400">{copy.stake.subtitle}</p>

      <div className="mt-5">
        <div className="flex items-center justify-between text-sm text-zinc-400">
          <span>{copy.stake.amountLabel}</span>
          <span>
            {copy.stake.balance}:{" "}
            {d.balance !== undefined ? formatZenAmount(d.balance, 4) : "—"}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.02] px-3 py-2.5 focus-within:border-brand-green/50">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full bg-transparent font-mono text-lg text-white outline-none placeholder:text-zinc-600"
            aria-label={`${copy.stake.amountLabel} (ZEN)`}
          />
          <span className="text-sm text-zinc-500">{copy.units.zen}</span>
          <button
            type="button"
            onClick={onMax}
            disabled={d.balance === undefined}
            className="min-h-9 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/15 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green"
          >
            {copy.cta.max}
          </button>
        </div>
        {d.insufficientBalance && (
          <p className="mt-1.5 text-xs text-red-300">{copy.errors.insufficientBalance}</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2.5 text-sm">
        <span className="text-zinc-400">{copy.stake.youReceive}</span>
        <span className="font-medium text-white tabular-nums">
          {d.previewShares !== undefined && amountWei
            ? approx(formatShares(d.previewShares))
            : "—"}
        </span>
      </div>

      <div className="mt-4">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={gasless}
            disabled={!gaslessSupported}
            onChange={(e) => {
              setGasless(e.target.checked);
              d.resetGasless();
            }}
            className="h-4 w-4 rounded border-white/20 bg-white/5 accent-[#31e0b5]"
          />
          {copy.stake.gaslessToggle}
          <InfoTooltip text={copy.stake.gaslessSignNote} />
        </label>
        {!gaslessSupported && (
          <p className="mt-1.5 text-xs text-zinc-500">{copy.stake.gaslessUnavailable}</p>
        )}

        {useGasless && amountWei && (
          <div className="mt-3 space-y-1.5 rounded-xl border border-white/[0.12] bg-white/[0.02] px-3 py-2.5 text-xs">
            <div className="flex justify-between text-zinc-400">
              <span>{copy.stake.gaslessMaxFee}</span>
              <span className="font-mono tabular-nums">{formatZenAmount(d.maxFeeZen, 4)}</span>
            </div>
            {d.gaslessFeeZen !== undefined && d.gaslessFeeZen > 0n && (
              <div className="flex justify-between text-zinc-400">
                <span>{copy.stake.gaslessEstFee}</span>
                <span className="font-mono tabular-nums">{approx(formatZenAmount(d.gaslessFeeZen, 4))}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-200">
              <span>{copy.stake.gaslessNetStake}</span>
              <span className="font-mono tabular-nums">
                {approx(
                  formatZenAmount(
                    amountWei - (d.gaslessFeeZen ?? 0n),
                    4,
                  ),
                )}
              </span>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void onSubmit()}
        disabled={!canSubmit}
        className="mt-5 w-full rounded-xl bg-brand-cta px-4 py-3 text-sm font-semibold text-black transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
      >
        {!d.isConnected ? copy.cta.connect : buttonLabel}
      </button>

      {d.needsApproval && !useGasless && !busy && (
        <p className="mt-2 text-center text-xs text-zinc-500">{copy.stake.needsApprovalNote}</p>
      )}

      {useGasless && d.gaslessPhase === "confirmed" && d.gaslessTxHash && (
        <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2.5 text-xs text-emerald-100">
          {copy.stake.gaslessSuccess}{" "}
          {explorerTxUrl(d.gaslessTxHash) && (
            <a
              href={explorerTxUrl(d.gaslessTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {copy.cta.viewExplorer} ↗
            </a>
          )}
        </div>
      )}

      {useGasless && d.gaslessPhase === "timeout" && (
        <div className="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.05] px-3 py-2.5 text-xs text-red-200">
          {copy.errors.relayerTimeout}
          <button
            type="button"
            onClick={() => {
              setGasless(false);
              d.resetGasless();
            }}
            className="ml-2 underline underline-offset-2 hover:opacity-80"
          >
            {copy.cta.fallbackToStandard}
          </button>
        </div>
      )}
    </Card>
  );
}

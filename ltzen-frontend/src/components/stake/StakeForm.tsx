"use client";

/**
 * StakeForm (uiux §4.1–4.3) — the deposit closure UI on Horizen.
 *
 * Wires the useDeposit state machine to a form:
 *   - amount input + Max (from ZEN balance) + ≤balance / >0 validation
 *   - live previewDeposit → "You receive ≈ N ltZEN"
 *   - standard path: button shows Approve → Stake based on allowance (uiux §4.2)
 *   - gasless path: toggle reveals fee transparency (max fee / est. fee / net staked) and the
 *     sign→submit→relaying→confirmed status; on timeout, offers the "use a standard deposit"
 *     fallback (uiux §4.3)
 *
 * Pause + wrong-balance + relayer-availability all reflected inline. Numbers in ZEN; the
 * received ltZEN is an estimate (≈), real balances never get the ≈ prefix.
 */

import { useMemo, useState } from "react";
import { parseEther } from "viem";
import { useDeposit } from "@/hooks/useDeposit";
import { gaslessSupported } from "@/relayer";
import { copy } from "@/lib/copy";
import { approx, formatShares, formatZen, formatZenAmount } from "@/lib/format";
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

export function StakeForm() {
  const [input, setInput] = useState("");
  const [gasless, setGasless] = useState(false);

  const amountWei = useMemo(() => parseAmount(input), [input]);
  const d = useDeposit({ amountWei });

  const useGasless = gasless && gaslessSupported;

  const busy =
    d.isBusy ||
    (useGasless &&
      d.gaslessPhase !== "idle" &&
      d.gaslessPhase !== "confirmed" &&
      d.gaslessPhase !== "timeout" &&
      d.gaslessPhase !== "failed");

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
      // classified + toasted inside the hook; gaslessPhase/error drive inline UI below.
    }
  };

  // Button label reflects standard approve→stake vs gasless.
  const buttonLabel = useGasless
    ? d.gaslessPhase === "signing"
      ? copy.stake.signing
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
      <h1 className="text-lg font-semibold text-white">{copy.stake.title}</h1>
      <p className="mt-1 text-sm text-zinc-400">{copy.stake.subtitle}</p>

      {/* Amount input */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-sm text-zinc-400">
          <span>{copy.stake.amountLabel}</span>
          <span>
            {copy.stake.balance}:{" "}
            {d.balance !== undefined ? formatZenAmount(d.balance, 4) : "—"}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 focus-within:border-emerald-400/40">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full bg-transparent text-lg text-white outline-none placeholder:text-zinc-600"
            aria-label={`${copy.stake.amountLabel} (ZEN)`}
          />
          <span className="text-sm text-zinc-500">{copy.units.zen}</span>
          <button
            type="button"
            onClick={onMax}
            disabled={d.balance === undefined}
            className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-white/15 disabled:opacity-40"
          >
            {copy.cta.max}
          </button>
        </div>
        {d.insufficientBalance && (
          <p className="mt-1.5 text-xs text-red-300">{copy.errors.insufficientBalance}</p>
        )}
      </div>

      {/* Preview */}
      <div className="mt-4 flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2.5 text-sm">
        <span className="text-zinc-400">{copy.stake.youReceive}</span>
        <span className="font-medium text-white tabular-nums">
          {d.previewShares !== undefined && amountWei
            ? approx(formatShares(d.previewShares))
            : "—"}
        </span>
      </div>

      {/* Gasless toggle + fee transparency (§4.3) */}
      <div className="mt-4">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={gasless}
            disabled={!gaslessSupported}
            onChange={(e) => setGasless(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5 accent-emerald-500"
          />
          {copy.stake.gaslessToggle}
          <InfoTooltip text={copy.stake.gaslessSignNote} />
        </label>
        {!gaslessSupported && (
          <p className="mt-1.5 text-xs text-zinc-500">{copy.stake.gaslessUnavailable}</p>
        )}

        {useGasless && amountWei && (
          <div className="mt-3 space-y-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-xs">
            <div className="flex justify-between text-zinc-400">
              <span>{copy.stake.gaslessMaxFee}</span>
              <span className="tabular-nums">{formatZenAmount(d.maxFeeZen, 4)}</span>
            </div>
            {d.gaslessFeeZen !== undefined && (
              <div className="flex justify-between text-zinc-400">
                <span>{copy.stake.gaslessEstFee}</span>
                <span className="tabular-nums">{approx(formatZenAmount(d.gaslessFeeZen, 4))}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-200">
              <span>{copy.stake.gaslessNetStake}</span>
              <span className="tabular-nums">
                {approx(
                  formatZenAmount(
                    amountWei - (d.gaslessFeeZen ?? d.maxFeeZen),
                    4,
                  ),
                )}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={() => void onSubmit()}
        disabled={!canSubmit}
        className="mt-5 w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {!d.isConnected ? copy.cta.connect : buttonLabel}
      </button>

      {d.needsApproval && !useGasless && !busy && (
        <p className="mt-2 text-center text-xs text-zinc-500">{copy.stake.needsApprovalNote}</p>
      )}

      {/* Relayer timeout fallback (§4.3) */}
      {useGasless && d.gaslessPhase === "timeout" && (
        <div className="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.05] px-3 py-2.5 text-xs text-red-200">
          {copy.errors.relayerTimeout}
          <button
            type="button"
            onClick={() => {
              setGasless(false);
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

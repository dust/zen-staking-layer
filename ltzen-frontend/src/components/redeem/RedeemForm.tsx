"use client";

/**
 * RedeemForm (uiux §5.1) — the redeem closure UI on Horizen.
 *
 * Input is ltZEN shares by default, with a toggle to enter a target ZEN amount instead (shares are
 * then reverse-calculated from the live exchange rate and marked ≈, since the on-chain settle
 * uses previewRedeem). Full-redeem (shares == balance) shows a "clears your position" note.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseEther } from "viem";
import { useRedeem } from "@/hooks/useRedeem";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { gaslessSupported } from "@/relayer";
import { copy } from "@/lib/copy";
import { approx, formatShares, formatZen, formatZenAmount } from "@/lib/format";
import { horizen } from "@/config/chains";
import { Card } from "@/components/common/Card";
import { GaslessFeePanel } from "@/components/common/GaslessFeePanel";
import { InfoTooltip } from "@/components/common/InfoTooltip";

type InputMode = "shares" | "zen";

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

export function RedeemForm() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<InputMode>("shares");
  const [gasless, setGasless] = useState(false);

  const { rate } = useExchangeRate();
  const rawWei = useMemo(() => parseAmount(input), [input]);

  // Resolve the share amount to redeem. In "zen" mode the user types a target ZEN amount; we
  // reverse-calc shares = zen / rate (≈, since previewRedeem settles the real assets on-chain).
  const sharesWei = useMemo(() => {
    if (rawWei === undefined) return undefined;
    if (mode === "shares") return rawWei;
    if (rate === undefined || rate === 0n) return undefined;
    return (rawWei * 10n ** 18n) / rate;
  }, [rawWei, mode, rate]);

  const r = useRedeem({ sharesWei, gaslessEnabled: gasless && gaslessSupported });

  const useGasless = gasless && gaslessSupported;

  const gaslessBusy =
    useGasless &&
    r.gaslessPhase !== "idle" &&
    r.gaslessPhase !== "confirmed" &&
    r.gaslessPhase !== "timeout" &&
    r.gaslessPhase !== "failed";

  const busy = r.isBusy || gaslessBusy;

  const feeReady = !useGasless || (r.feeQuote.ready && !r.feeQuote.error);

  const canSubmit =
    Boolean(sharesWei) &&
    r.isConnected &&
    r.isConfigured &&
    !r.insufficientShares &&
    !busy &&
    feeReady;

  const onMax = () => {
    if (r.shareBalance === undefined) return;
    if (mode === "shares") {
      setInput(formatShares(r.shareBalance).replace(/[^\d.]/g, ""));
    } else if (rate !== undefined) {
      // Target the full ZEN value of the balance.
      const zenValue = (r.shareBalance * rate) / 10n ** 18n;
      setInput(formatZen(zenValue, 18).replace(/,/g, ""));
    }
  };

  const onSubmit = async () => {
    try {
      if (useGasless) await r.redeemGasless();
      else await r.redeem();
      setInput("");
    } catch {
      /* classified + toasted inside hook */
    }
  };

  const buttonLabel = useGasless
    ? r.gaslessPhase === "signing"
      ? copy.redeem.signing
      : r.gaslessPhase === "submitting"
        ? copy.redeem.submitting
        : r.gaslessPhase === "relaying"
          ? copy.redeem.relayerWaiting
          : copy.cta.redeem
    : r.state.phase === "awaiting-signature" || r.state.phase === "pending"
      ? copy.cta.redeeming
      : copy.cta.redeem;

  const unitLabel = mode === "shares" ? copy.units.ltZen : copy.units.zen;

  return (
    <Card className="max-w-xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-white">{copy.redeem.title}</h1>
          <p className="mt-1 text-sm text-zinc-400">{copy.redeem.subtitle}</p>
        </div>
        <div className="flex rounded-lg border border-white/[0.12] bg-white/[0.03] p-0.5 text-xs">
          {(["shares", "zen"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setInput("");
              }}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green ${
                mode === m ? "bg-brand-green/15 text-brand-green" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {m === "shares" ? copy.redeem.byShares : copy.redeem.byZen}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-sm text-zinc-400">
          <span>{copy.redeem.amountLabel}</span>
          <span>
            {copy.redeem.holdings}:{" "}
            {r.shareBalance !== undefined ? formatShares(r.shareBalance) : "—"}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.02] px-3 py-2.5 focus-within:border-brand-green/50">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full bg-transparent font-mono text-lg text-white outline-none placeholder:text-zinc-600"
            aria-label={`${copy.redeem.amountLabel} (${unitLabel})`}
          />
          <span className="text-sm text-zinc-500">{unitLabel}</span>
          <button
            type="button"
            onClick={onMax}
            disabled={r.shareBalance === undefined}
            className="min-h-9 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/15 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green"
          >
            {copy.cta.max}
          </button>
        </div>
        {mode === "zen" && sharesWei !== undefined && (
          <p className="mt-1.5 text-xs text-zinc-500">
            {copy.redeem.byShares}: {approx(formatShares(sharesWei))}
          </p>
        )}
        {r.insufficientShares && (
          <p className="mt-1.5 text-xs text-red-300">{copy.redeem.noShares}</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2.5 text-sm">
        <span className="text-zinc-400">{copy.redeem.youReceive}</span>
        <span className="font-medium text-white tabular-nums">
          {r.previewAssets !== undefined && sharesWei
            ? approx(formatZenAmount(r.previewAssets, 4))
            : "—"}
        </span>
      </div>

      {r.isFullRedeem && (
        <p className="mt-2 text-xs text-amber-200">{copy.redeem.fullRedeemNote}</p>
      )}

      <div className="mt-4">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={gasless}
            disabled={!gaslessSupported}
            onChange={(e) => {
              setGasless(e.target.checked);
              r.resetGasless();
            }}
            className="h-4 w-4 rounded border-white/20 bg-white/5 accent-[#31e0b5]"
          />
          {copy.redeem.gaslessToggle}
          <InfoTooltip text={copy.redeem.gaslessSignNote} />
        </label>
        {!gaslessSupported && (
          <p className="mt-1.5 text-xs text-zinc-500">{copy.redeem.gaslessUnavailable}</p>
        )}

        {useGasless && sharesWei && (
          <GaslessFeePanel
            quote={r.feeQuote.quote}
            error={r.feeQuote.error}
            loading={r.feeQuote.loading}
            grossAssets={r.previewAssets}
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => void onSubmit()}
        disabled={!canSubmit}
        className="mt-5 w-full rounded-xl bg-brand-cta px-4 py-3 text-sm font-semibold text-black transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
      >
        {!r.isConnected ? copy.cta.connect : buttonLabel}
      </button>

      <p className="mt-2 text-center text-xs text-zinc-500">{copy.redeem.harvestNote}</p>

      <p className="mt-3 text-center text-xs text-zinc-500">
        {copy.redeemToBase.linkFromRedeem}{" "}
        <Link
          href="/redeem-to-base"
          className="text-zinc-200 underline-offset-2 hover:text-white hover:underline"
        >
          {copy.redeem.redeemToBaseCta}
        </Link>
      </p>

      {useGasless && r.gaslessPhase === "confirmed" && r.gaslessTxHash && (
        <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2.5 text-xs text-emerald-100">
          {copy.redeem.gaslessSuccess}{" "}
          {explorerTxUrl(r.gaslessTxHash) && (
            <a
              href={explorerTxUrl(r.gaslessTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {copy.cta.viewExplorer} ↗
            </a>
          )}
        </div>
      )}

      {useGasless && r.gaslessPhase === "timeout" && (
        <div className="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.05] px-3 py-2.5 text-xs text-red-200">
          {copy.errors.relayerTimeout}
          <button
            type="button"
            onClick={() => {
              setGasless(false);
              r.resetGasless();
            }}
            className="ml-2 underline underline-offset-2 hover:opacity-80"
          >
            {copy.cta.fallbackToStandardRedeem}
          </button>
        </div>
      )}
    </Card>
  );
}

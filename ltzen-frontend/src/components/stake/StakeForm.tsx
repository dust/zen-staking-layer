"use client";

/**
 * StakeForm (uiux §4.1–4.2) — the deposit closure UI on Horizen.
 */

import { useMemo, useState } from "react";
import { parseEther } from "viem";
import { useDeposit } from "@/hooks/useDeposit";
import { copy } from "@/lib/copy";
import { approx, formatShares, formatZen, formatZenAmount } from "@/lib/format";
import { Card } from "@/components/common/Card";

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

  const amountWei = useMemo(() => parseAmount(input), [input]);
  const d = useDeposit({ amountWei });

  const busy = d.isBusy;

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
      await d.deposit();
      setInput("");
    } catch {
      /* classified + toasted inside hook */
    }
  };

  const buttonLabel =
    d.state.phase === "awaiting-signature" || d.state.phase === "pending"
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

      <button
        type="button"
        onClick={() => void onSubmit()}
        disabled={!canSubmit}
        className="mt-5 w-full rounded-xl bg-brand-cta px-4 py-3 text-sm font-semibold text-black transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
      >
        {!d.isConnected ? copy.cta.connect : buttonLabel}
      </button>

      {d.needsApproval && !busy && (
        <p className="mt-2 text-center text-xs text-zinc-500">{copy.stake.needsApprovalNote}</p>
      )}

      <p className="mt-4 text-center text-xs text-zinc-500">
        <a
          href="/stake-crosschain"
          className="text-zinc-300 underline-offset-2 hover:text-white hover:underline"
        >
          {copy.stake.stakeFromBaseCta}
        </a>
      </p>
    </Card>
  );
}

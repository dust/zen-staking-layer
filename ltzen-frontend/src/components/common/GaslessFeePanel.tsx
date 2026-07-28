"use client";

import { copy } from "@/lib/copy";
import { approx, formatZenAmount } from "@/lib/format";
import type { FeeQuote } from "@/lib/feeQuote";
import type { FeeQuoteError } from "@/lib/feeQuote";

type Props = {
  quote?: FeeQuote;
  error?: FeeQuoteError;
  loading?: boolean;
  /** Assets before fee (for net display). */
  grossAssets?: bigint;
  netLabel?: string;
  className?: string;
};

export function GaslessFeePanel({
  quote,
  error,
  loading,
  grossAssets,
  netLabel = copy.redeem.gaslessNetReceive,
  className = "",
}: Props) {
  if (loading && !quote) {
    return (
      <div className={`mt-3 space-y-1 text-xs text-zinc-500 ${className}`}>
        Estimating relayer fee…
      </div>
    );
  }

  if (error) {
    const msg =
      error.code === "amount_too_small" || error.code === "fee_hits_cap"
        ? copy.redeem.gaslessFeeTooHigh
        : error.message;
    return (
      <div className={`mt-3 text-xs text-amber-400/90 ${className}`}>{msg}</div>
    );
  }

  if (!quote) return null;

  const feeZen = BigInt(quote.feeZen);
  const maxFeeZen = BigInt(quote.maxFeeZen);
  const net =
    grossAssets !== undefined && grossAssets > feeZen ? grossAssets - feeZen : undefined;
  const showService = quote.breakdown.profitBps > 0;
  const showFloor = quote.breakdown.rateSource === "floor";

  return (
    <div className={`mt-3 space-y-1.5 text-xs text-zinc-400 ${className}`}>
      <div className="flex justify-between gap-3">
        <span>{copy.redeem.gaslessEstFee}</span>
        <span className="font-mono tabular-nums text-zinc-200">
          {approx(formatZenAmount(feeZen, 4))}
        </span>
      </div>
      <div className="flex justify-between gap-3">
        <span>{copy.redeem.gaslessMaxFee}</span>
        <span className="font-mono tabular-nums text-zinc-200">
          {formatZenAmount(maxFeeZen, 4)}
        </span>
      </div>
      {net !== undefined && (
        <div className="flex justify-between gap-3">
          <span>{netLabel}</span>
          <span className="font-mono tabular-nums text-zinc-200">
            {approx(formatZenAmount(net, 4))}
          </span>
        </div>
      )}
      {(showFloor || showService) && (
        <p className="pt-0.5 text-[11px] text-zinc-500">
          {showFloor ? copy.redeem.gaslessRateFloor : null}
          {showFloor && showService ? " · " : null}
          {showService ? copy.redeem.gaslessIncludesServiceFee : null}
        </p>
      )}
      {BigInt(quote.breakdown.lzNativeWei) > 0n && (
        <p className="text-[11px] text-zinc-500">{copy.redeem.gaslessBreakdownLz}</p>
      )}
    </div>
  );
}

"use client";

/**
 * FaucetButton — mints up to 256 test ZEN on Base (MockZEN). Horizen ZenTokenOFT has no faucet.
 */

import { useFaucet, FAUCET_AMOUNT_ZEN } from "@/hooks/useFaucet";
import { copy } from "@/lib/copy";

export function FaucetButton() {
  const { mint, isBusy, isConfigured, isConnected } = useFaucet();

  if (!isConfigured) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void mint()}
        disabled={isBusy || !isConnected}
        className="inline-flex items-center rounded-xl border border-white/[0.12] bg-white/[0.03] px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
      >
        {isBusy
          ? copy.cta.gettingTestZen
          : `${copy.cta.getTestZen} (${FAUCET_AMOUNT_ZEN.toString()} ZEN)`}
      </button>
      <span className="text-xs text-zinc-500">{copy.faucet.note}</span>
    </div>
  );
}

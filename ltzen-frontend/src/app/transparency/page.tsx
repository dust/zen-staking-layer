import type { Metadata } from "next";
import { copy } from "@/lib/copy";
import { RawMetricsTable } from "@/components/transparency/RawMetricsTable";
import { AddressList } from "@/components/transparency/AddressList";
import { HarvestHistory } from "@/components/transparency/HarvestHistory";

/**
 * Transparency page (uiux §7). Public, no wallet, never chain-gated — all metrics read from the
 * Horizen hub regardless of the active chain (chainGating treats `transparency` as always
 * available). For auditors / integrators / the curious: raw values + explorer links so every
 * number can be verified independently of this frontend.
 */
export const metadata: Metadata = {
  title: "Transparency — ltZEN",
  description: "Raw on-chain metrics and contract addresses, verifiable on the explorer.",
};

export default function TransparencyPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <header className="max-w-2xl">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">{copy.transparency.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {copy.transparency.subtitle}
        </p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <RawMetricsTable />
        <AddressList />
      </div>

      <div className="mt-6">
        <HarvestHistory />
      </div>

      <p className="mt-6 text-xs text-zinc-500">{copy.transparency.verifyHint}</p>
    </div>
  );
}

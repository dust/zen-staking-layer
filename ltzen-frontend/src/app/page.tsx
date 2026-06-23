"use client";

import { useAccount, useChainId } from "wagmi";
import { getAvailability, type AppAction } from "@/lib/chainGating";
import { isSupportedChainId } from "@/config/chains";

/**
 * M0 placeholder Overview. Its job for this milestone is to PROVE the multi-chain geometry
 * works: connect a wallet, switch Horizen⇄Base in the header, and watch the action matrix
 * below update live. Real Overview content (HeroRate / PositionCard / charts) lands in M1.
 */

const ACTIONS: { action: AppAction; label: string }[] = [
  { action: "view", label: "View rate & holdings" },
  { action: "deposit", label: "Stake (deposit)" },
  { action: "redeem", label: "Redeem" },
  { action: "bridge", label: "Bridge ltZEN" },
  { action: "faucet", label: "Get test ZEN" },
  { action: "transparency", label: "Transparency" },
];

function statusBadge(status: string) {
  switch (status) {
    case "available":
      return { text: "Available", cls: "bg-emerald-500/15 text-emerald-300" };
    case "guide-switch-chain":
      return { text: "Switch to Horizen", cls: "bg-sky-500/15 text-sky-300" };
    case "guide-bridge":
      return { text: "Bridge back first", cls: "bg-sky-500/15 text-sky-300" };
    case "wrong-network":
      return { text: "Wrong network", cls: "bg-amber-500/15 text-amber-300" };
    default:
      return { text: status, cls: "bg-white/10 text-zinc-300" };
  }
}

export default function Home() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const supported = isSupportedChainId(chainId);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold text-white">ltZEN</h1>
      <p className="mt-1 text-zinc-400">
        Liquid staking for ZEN. Your stake compounds while you hold.
      </p>

      <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-300">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span>
            Wallet:{" "}
            <strong className={isConnected ? "text-emerald-300" : "text-zinc-500"}>
              {isConnected ? "connected" : "not connected"}
            </strong>
          </span>
          <span>
            Network:{" "}
            <strong className={supported ? "text-emerald-300" : "text-amber-300"}>
              {supported ? `chain ${chainId}` : "unsupported"}
            </strong>
          </span>
        </div>
        <p className="mt-2 text-zinc-500">
          M0 demo — switch networks in the header and watch the action matrix update.
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ACTIONS.map(({ action, label }) => {
          const avail = getAvailability(action, chainId);
          const badge = statusBadge(avail.status);
          const reason =
            "reason" in avail ? avail.reason : undefined;
          return (
            <div
              key={action}
              className="rounded-lg border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-white">{label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                >
                  {badge.text}
                </span>
              </div>
              {reason && (
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                  {reason}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

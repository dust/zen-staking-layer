"use client";

import { useChainId, useSwitchChain } from "wagmi";
import { chains, isSupportedChainId } from "@/config/chains";

/**
 * ChainSwitcher (uiux §2.1 header). Switching between Horizen/Base drives which actions
 * are available across the app (gating happens in lib/chainGating.ts, consumed per-page).
 *
 * On an unsupported network the switcher highlights nothing and the WalletButton surfaces
 * the wrong-network prompt.
 */
export function ChainSwitcher() {
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const onSupported = isSupportedChainId(chainId);

  return (
    <div
      role="group"
      aria-label="Select network"
      className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] p-0.5"
    >
      {chains.map((c) => {
        const active = onSupported && c.id === chainId;
        return (
          <button
            key={c.id}
            type="button"
            disabled={isPending || active}
            aria-pressed={active}
            onClick={() => switchChain({ chainId: c.id })}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
              active
                ? "bg-brand-green/15 text-brand-green"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {c.name.replace(" Testnet", "").replace(" Sepolia", "")}
          </button>
        );
      })}
    </div>
  );
}

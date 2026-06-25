"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

/**
 * WalletButton implements the §2.2 connection state machine using RainbowKit's headless
 * ConnectButton.Custom so we control every label/behavior:
 *
 *   disconnected          → "Connect Wallet"
 *   connected-wrong-chain → "Wrong network" + one-click switch prompt (write buttons elsewhere
 *                           disable via chainGating; here we surface the switch CTA)
 *   connected-correct     → "0x12..ab ▾" account button
 *
 * connecting / switching are transient (button shows nothing until resolved). Connect failures
 * surface as RainbowKit's own non-blocking modal (retryable), per §2.2.
 */
export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    className="rounded-full bg-gradient-to-br from-brand-teal to-brand-green px-4 py-1.5 text-sm font-semibold text-black transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
                  >
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    type="button"
                    onClick={openChainModal}
                    className="rounded-full bg-amber-500/15 px-4 py-1.5 text-sm font-semibold text-amber-300 ring-1 ring-amber-500/40 transition-colors hover:bg-amber-500/25"
                  >
                    Wrong network — switch
                  </button>
                );
              }

              return (
                <button
                  type="button"
                  onClick={openAccountModal}
                  className="rounded-full border border-white/[0.12] bg-white/[0.03] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
                >
                  {account.displayName}
                  <span className="ml-1 text-zinc-400">▾</span>
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

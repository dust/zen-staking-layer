import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { base, chains, horizen } from "./chains";

/**
 * Multi-chain wagmi config wired through RainbowKit (frontend-plan §2 config/wagmi.ts).
 *
 * Notes for these exact versions:
 *   - wagmi v3.6: `transports` keyed by chain.id, `http()` from viem/wagmi — unchanged from v2.
 *   - RainbowKit 2.2's `getDefaultConfig` wraps wagmi `createConfig`; `projectId` is REQUIRED
 *     (WalletConnect Cloud). Injected via env so it isn't committed.
 *   - `ssr: true` is required for the Next.js App Router (avoids hydration mismatch).
 */

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";

// RainbowKit's getDefaultConfig throws on an empty projectId (it gets evaluated even during
// static prerender of /_not-found). Fall back to a placeholder so `next build` is green before
// the real WalletConnect projectId is set; WalletConnect just won't initialize until it's filled.
const resolvedProjectId = projectId || "ltzen-dev-placeholder";

export const wagmiConfig = getDefaultConfig({
  appName: "ltZEN",
  appDescription: "Liquid staking for ZEN — your stake compounds while you hold.",
  projectId: resolvedProjectId,
  chains,
  transports: {
    [horizen.id]: http(),
    [base.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

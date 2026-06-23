import { HUB_CHAIN_ID, SPOKE_CHAIN_ID, isSupportedChainId } from "@/config/chains";

/**
 * Chain-aware action gating (frontend-plan §4 + uiux-spec §6.1 动作可用性矩阵).
 *
 * The active chain decides which actions are available. Crucially, Base does NOT hard-error
 * on Horizen-only actions — it *guides* the user (switch to Horizen, or bridge back first).
 *
 * §6.1 matrix:
 *   action      | Horizen | Base
 *   ------------|---------|---------------------------
 *   view        | ✅       | ✅ (rate read from Horizen)
 *   transparency| ✅       | ✅ ("rate settles on Horizen")
 *   deposit     | ✅       | ❌ → guide: switch to Horizen
 *   redeem      | ✅       | ❌ → guide: bridge back to Horizen
 *   bridge      | ✅       | ✅
 *   faucet      | ✅       | ❌ (Horizen-only; not in §6.1, scoped to test ZEN)
 *   gasless     | deposit/redeem | bridge   (per-action, see canGasless)
 */

export type AppAction =
  | "view"
  | "transparency"
  | "deposit"
  | "redeem"
  | "bridge"
  | "faucet";

export type Availability =
  | { status: "available" }
  | { status: "wrong-network"; switchTo: number }
  | { status: "guide-switch-chain"; switchTo: number; reason: string }
  | { status: "guide-bridge"; reason: string };

const HORIZEN_ONLY: AppAction[] = ["deposit", "redeem", "faucet"];

/**
 * Resolve whether `action` is usable on `chainId`.
 * `view` / `transparency` are never gated (public, read-only — rate always sourced
 * from Horizen even when viewing on Base).
 */
export function getAvailability(
  action: AppAction,
  chainId: number | undefined,
): Availability {
  // Public reads + bridge are available everywhere supported.
  if (action === "view" || action === "transparency" || action === "bridge") {
    return { status: "available" };
  }

  // Unknown / unsupported network: prompt switch to the hub for write actions.
  if (!isSupportedChainId(chainId)) {
    return { status: "wrong-network", switchTo: HUB_CHAIN_ID };
  }

  if (chainId === HUB_CHAIN_ID) {
    return { status: "available" };
  }

  // On Base (spoke): guide rather than error (uiux §6.1 / §5.2).
  if (chainId === SPOKE_CHAIN_ID && HORIZEN_ONLY.includes(action)) {
    if (action === "redeem") {
      return {
        status: "guide-bridge",
        reason:
          "Redeeming happens on Horizen. Your ltZEN is on Base — bridge it back to Horizen first, then redeem for ZEN.",
      };
    }
    return {
      status: "guide-switch-chain",
      switchTo: HUB_CHAIN_ID,
      reason:
        action === "faucet"
          ? "Test ZEN is only available on Horizen. Switch to Horizen to use the faucet."
          : "Staking happens on Horizen. Switch to Horizen to deposit.",
    };
  }

  return { status: "available" };
}

export function isActionAvailable(
  action: AppAction,
  chainId: number | undefined,
): boolean {
  return getAvailability(action, chainId).status === "available";
}

/**
 * gasless scope is per-action-per-chain (uiux §6.1 note):
 *   Horizen → deposit/redeem ; Base → bridge.
 */
export function canGasless(action: AppAction, chainId: number | undefined): boolean {
  if (chainId === HUB_CHAIN_ID) {
    return action === "deposit" || action === "redeem";
  }
  if (chainId === SPOKE_CHAIN_ID) {
    return action === "bridge";
  }
  return false;
}

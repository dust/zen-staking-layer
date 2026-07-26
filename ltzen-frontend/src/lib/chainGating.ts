import { HUB_CHAIN_ID, SPOKE_CHAIN_ID, isSupportedChainId } from "@/config/chains";
import { copy } from "@/lib/copy";

/**
 * Chain-aware action gating (frontend-plan §4 + uiux-spec §6.1).
 *
 * Test faucet is Base-only (MockZEN). Horizen ZenTokenOFT has no mint faucet.
 *
 *   action           | Horizen | Base
 *   -----------------|---------|---------------------------
 *   view             | ✅       | ✅
 *   transparency     | ✅       | ✅
 *   deposit          | ✅       | ❌ → guide: switch / Stake from Base
 *   redeem           | ✅       | ❌ → guide: bridge back
 *   redeemToBase     | ✅       | ❌ → guide: switch to Horizen
 *   bridge           | ✅       | ✅
 *   crossChainStake  | ❌ → Base | ✅
 *   faucet           | ❌ → Base | ✅ (MockZEN mint ≤256)
 */

export type AppAction =
  | "view"
  | "transparency"
  | "deposit"
  | "redeem"
  | "redeemToBase"
  | "bridge"
  | "crossChainStake"
  | "faucet";

export type Availability =
  | { status: "available" }
  | { status: "wrong-network"; switchTo: number }
  | { status: "guide-switch-chain"; switchTo: number; reason: string }
  | { status: "guide-bridge"; reason: string }
  | { status: "guide-cross-stake"; reason: string };

const HORIZEN_ONLY: AppAction[] = ["deposit", "redeem", "redeemToBase"];

export function getAvailability(
  action: AppAction,
  chainId: number | undefined,
): Availability {
  if (action === "view" || action === "transparency" || action === "bridge") {
    return { status: "available" };
  }

  if (action === "crossChainStake" || action === "faucet") {
    if (!isSupportedChainId(chainId)) {
      return { status: "wrong-network", switchTo: SPOKE_CHAIN_ID };
    }
    if (chainId === SPOKE_CHAIN_ID) {
      return { status: "available" };
    }
    return {
      status: "guide-switch-chain",
      switchTo: SPOKE_CHAIN_ID,
      reason:
        action === "faucet" ? copy.faucet.guideOnHorizen : copy.crossStake.guideOnHorizen,
    };
  }

  if (!isSupportedChainId(chainId)) {
    return { status: "wrong-network", switchTo: HUB_CHAIN_ID };
  }

  if (chainId === HUB_CHAIN_ID) {
    return { status: "available" };
  }

  if (chainId === SPOKE_CHAIN_ID && HORIZEN_ONLY.includes(action)) {
    if (action === "redeem") {
      return {
        status: "guide-bridge",
        reason:
          "Redeeming happens on Horizen. Your ltZEN is on Base — bridge it back to Horizen first, then redeem for ZEN.",
      };
    }
    if (action === "redeemToBase") {
      return {
        status: "guide-switch-chain",
        switchTo: HUB_CHAIN_ID,
        reason: copy.redeemToBase.guideOnBase,
      };
    }
    return {
      status: "guide-cross-stake",
      reason: copy.crossStake.guideOnBaseDeposit,
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

export function canGasless(action: AppAction, chainId: number | undefined): boolean {
  if (chainId === HUB_CHAIN_ID) {
    // Same-chain deposit is approve+deposit only (no gasless UX).
    return action === "redeem" || action === "redeemToBase";
  }
  if (chainId === SPOKE_CHAIN_ID) {
    return action === "bridge";
  }
  return false;
}

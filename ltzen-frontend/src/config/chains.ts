import { defineChain } from "viem";

/**
 * Two custom EVM chains for the ltZEN dApp (frontend-plan §1):
 *   - Horizen Testnet (hub): deposit / redeem / exchange-rate / transparency settle here.
 *   - Base (spoke): ltZEN OFT circulation; cross-chain ZEN stake via ERC20 + ZenTokenOFTAdapter;
 *     no same-chain deposit/redeem, no rate source.
 *
 * RPC / explorer URLs are env-injected (never hardcoded). Horizen has sane testnet
 * defaults from the deploy docs; Base is fully env-driven (chainId/RPC/explorer 待填).
 */

const HORIZEN_RPC =
  process.env.NEXT_PUBLIC_HORIZEN_RPC_URL ??
  "https://horizen-testnet.rpc.caldera.xyz/http";
const HORIZEN_EXPLORER =
  process.env.NEXT_PUBLIC_HORIZEN_EXPLORER_URL ??
  "https://horizen.calderaexplorer.xyz";

export const horizen = defineChain({
  id: 2651420,
  name: "Horizen Testnet",
  nativeCurrency: { name: "ZEN", symbol: "ZEN", decimals: 18 },
  rpcUrls: {
    default: { http: [HORIZEN_RPC] },
  },
  blockExplorers: {
    default: { name: "Horizen Caldera Explorer", url: HORIZEN_EXPLORER },
  },
  testnet: true,
});

/**
 * Base spoke. chainId/RPC/explorer are env-driven and 待填; we fall back to Base
 * Sepolia testnet (84532) so the app boots before the real values are set.
 */
const BASE_CHAIN_ID = Number(process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? "84532");
const BASE_RPC =
  process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://sepolia.base.org";
const BASE_EXPLORER =
  process.env.NEXT_PUBLIC_BASE_EXPLORER_URL ?? "https://sepolia.basescan.org";
const BASE_NAME = process.env.NEXT_PUBLIC_BASE_CHAIN_NAME ?? "Base Sepolia";

export const base = defineChain({
  id: BASE_CHAIN_ID,
  name: BASE_NAME,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [BASE_RPC] },
  },
  blockExplorers: {
    default: { name: `${BASE_NAME} Explorer`, url: BASE_EXPLORER },
  },
  testnet: true,
});

/** Hub chain where all rate/deposit/redeem state settles. */
export const HUB_CHAIN_ID = horizen.id;
/** Spoke chain for ltZEN OFT circulation. */
export const SPOKE_CHAIN_ID = base.id;

/** Tuple form required by wagmi's `createConfig({ chains })`. */
export const chains = [horizen, base] as const;

export type AppChainId = (typeof chains)[number]["id"];

export function isSupportedChainId(id: number | undefined): id is AppChainId {
  return id === horizen.id || id === base.id;
}

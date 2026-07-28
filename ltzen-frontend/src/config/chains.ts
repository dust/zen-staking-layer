import { defineChain } from "viem";

/**
 * Two custom EVM chains for the ltZEN dApp (frontend-plan §1):
 *   - Horizen (hub): deposit / redeem / exchange-rate / transparency settle here.
 *   - Base (spoke): ltZEN OFT circulation; cross-chain ZEN stake via ERC20 + ZenTokenOFTAdapter;
 *     no same-chain deposit/redeem, no rate source.
 *
 * Network mode is driven by NEXT_PUBLIC_NETWORK_ENV (`testnet` | `mainnet`).
 * When unset, inferred from NEXT_PUBLIC_BASE_CHAIN_ID (84532 → testnet, else mainnet).
 * Per-chain RPC / explorer / id / name remain overridable via env.
 */

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_MAINNET_CHAIN_ID = 8453;
export const HORIZEN_TESTNET_CHAIN_ID = 2651420;
export const HORIZEN_MAINNET_CHAIN_ID = 26514;

type NetworkEnv = "testnet" | "mainnet";

function resolveNetworkEnv(): NetworkEnv {
  const explicit = process.env.NEXT_PUBLIC_NETWORK_ENV?.trim().toLowerCase();
  if (explicit === "testnet" || explicit === "mainnet") return explicit;
  const baseId = Number(process.env.NEXT_PUBLIC_BASE_CHAIN_ID ?? String(BASE_MAINNET_CHAIN_ID));
  return baseId === BASE_SEPOLIA_CHAIN_ID ? "testnet" : "mainnet";
}

export const NETWORK_ENV: NetworkEnv = resolveNetworkEnv();
export const IS_TESTNET_ENV = NETWORK_ENV === "testnet";

const TESTNET_DEFAULTS = {
  horizen: {
    id: HORIZEN_TESTNET_CHAIN_ID,
    name: "Horizen Testnet",
    rpc: "https://horizen-testnet.rpc.caldera.xyz/http",
    explorer: "https://horizen-testnet.explorer.caldera.xyz",
    explorerName: "Horizen Testnet Explorer",
  },
  base: {
    id: BASE_SEPOLIA_CHAIN_ID,
    name: "Base Sepolia",
    rpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
  },
} as const;

const MAINNET_DEFAULTS = {
  horizen: {
    id: HORIZEN_MAINNET_CHAIN_ID,
    name: "Horizen",
    rpc: "https://horizen.calderachain.xyz/http",
    explorer: "https://horizen.calderaexplorer.xyz",
    explorerName: "Horizen Caldera Explorer",
  },
  base: {
    id: BASE_MAINNET_CHAIN_ID,
    name: "Base",
    rpc: "https://mainnet.base.org",
    explorer: "https://base.blockscout.com",
  },
} as const;

const defaults = IS_TESTNET_ENV ? TESTNET_DEFAULTS : MAINNET_DEFAULTS;

function envNumber(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const HORIZEN_CHAIN_ID = envNumber(
  process.env.NEXT_PUBLIC_HORIZEN_CHAIN_ID,
  defaults.horizen.id,
);
const HORIZEN_RPC =
  process.env.NEXT_PUBLIC_HORIZEN_RPC_URL ?? defaults.horizen.rpc;
const HORIZEN_EXPLORER =
  process.env.NEXT_PUBLIC_HORIZEN_EXPLORER_URL ?? defaults.horizen.explorer;

const BASE_CHAIN_ID = envNumber(
  process.env.NEXT_PUBLIC_BASE_CHAIN_ID,
  defaults.base.id,
);
const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? defaults.base.rpc;
const BASE_EXPLORER =
  process.env.NEXT_PUBLIC_BASE_EXPLORER_URL ?? defaults.base.explorer;
const BASE_NAME = process.env.NEXT_PUBLIC_BASE_CHAIN_NAME ?? defaults.base.name;

export const horizen = defineChain({
  id: HORIZEN_CHAIN_ID,
  name: defaults.horizen.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [HORIZEN_RPC] },
  },
  blockExplorers: {
    default: { name: defaults.horizen.explorerName, url: HORIZEN_EXPLORER },
  },
  testnet: IS_TESTNET_ENV,
});

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
  testnet: IS_TESTNET_ENV,
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

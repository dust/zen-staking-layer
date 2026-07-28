/** Server-only fee / gas / price configuration (fee-spec §7). */

import type { RelayKind } from "@/relayer/types";

export function rrelayerConfigured(): boolean {
  const hasId = Boolean(process.env.RRELAYER_RELAYER_ID?.trim());
  const hasServer = Boolean(process.env.RRELAYER_SERVER_URL?.trim());
  const hasAuth =
    Boolean(process.env.RRELAYER_API_KEY?.trim()) ||
    (Boolean(process.env.RRELAYER_AUTH_USERNAME?.trim()) &&
      Boolean(process.env.RRELAYER_AUTH_PASSWORD?.trim()));
  return hasId && hasServer && hasAuth;
}

/** @deprecated Prefer FEE_PROFIT_BPS. Do not use as primary pricing. */
export function relayerFeeBps(): bigint {
  const raw = process.env.RELAYER_FEE_BPS ?? "50";
  try {
    return BigInt(raw);
  } catch {
    return 50n;
  }
}

function parseBigIntEnv(name: string, fallback: bigint): bigint {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  try {
    return BigInt(raw);
  } catch {
    return fallback;
  }
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Matches StLighter.MAX_GAS_FEE_ZEN (10 ZEN). */
export const MAX_GAS_FEE_ZEN = 10n * 10n ** 18n;

export function feeBufferBps(): bigint {
  return parseBigIntEnv("FEE_BUFFER_BPS", 1500n);
}

export function feeMarginBps(): bigint {
  return parseBigIntEnv("FEE_MARGIN_BPS", 0n);
}

/** Profit floor vs basis (fee-spec §2.6). Default 0 = off. Ops-configurable. */
export function feeProfitBps(): bigint {
  return parseBigIntEnv("FEE_PROFIT_BPS", 0n);
}

export function quoteTtlSec(): number {
  return parseIntEnv("QUOTE_TTL_SEC", 60);
}

export function priceDeviationBps(): bigint {
  return parseBigIntEnv("PRICE_DEVIATION_BPS", 3000n);
}

/** 1e18-scaled: 1 ETH = zenPerEth/1e18 ZEN. Required for production; tests inject. */
export function zenPerEthFloor(): bigint | undefined {
  const raw = process.env.ZEN_PER_ETH_FLOOR?.trim();
  if (!raw) return undefined;
  try {
    const n = BigInt(raw);
    return n > 0n ? n : undefined;
  } catch {
    return undefined;
  }
}

export function priceProviderId(): string {
  // Default: Base Aerodrome (fee-spec §3.3.1). CoinGecko often omits horizen.
  return process.env.PRICE_PROVIDER?.trim() || "aerodrome";
}

export function priceApiKey(): string | undefined {
  return process.env.PRICE_API_KEY?.trim() || undefined;
}

export function priceApiUrl(): string | undefined {
  return process.env.PRICE_API_URL?.trim() || undefined;
}

/** Base mainnet RPC for Aerodrome quotes (independent of app testnet/mainnet mode). */
export function basePriceRpcUrl(): string {
  return (
    process.env.BASE_PRICE_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() ||
    "https://mainnet.base.org"
  );
}

function parseAddressEnv(name: string, fallback: `0x${string}`): `0x${string}` {
  const v = process.env[name]?.trim();
  if (v && /^0x[0-9a-fA-F]{40}$/.test(v)) return v as `0x${string}`;
  return fallback;
}

/** Aerodrome Base mainnet defaults (fee-spec §3.3.1). */
export function aerodromeWethAddress(): `0x${string}` {
  return parseAddressEnv(
    "AERODROME_WETH_ADDRESS",
    "0x4200000000000000000000000000000000000006",
  );
}

export function aerodromeZenAddress(): `0x${string}` {
  return parseAddressEnv(
    "AERODROME_ZEN_ADDRESS",
    "0xf43eb8de897fbc7f2502483b2bef7bb9ea179229",
  );
}

/**
 * Deep Slipstream CL pool ZEN/WETH 0.15% on Base (~$1–2M TVL).
 * Do not use the thin vAMM pair `0xB5ff…e928` — its spot is orders of magnitude off.
 */
export function aerodromeZenWethPoolAddress(): `0x${string}` {
  return parseAddressEnv(
    "AERODROME_ZEN_WETH_POOL",
    "0x0392b12a1ceb0cd13af5ea448cf5586ea609852d",
  );
}

export function gasPriceProviderUrl(): string | undefined {
  return process.env.GAS_PRICE_PROVIDER_URL?.trim() || undefined;
}

export function gasCeilMaxFeeWei(): bigint {
  return parseBigIntEnv("GAS_CEIL_MAX_FEE_WEI", 5_000_000_000n);
}

const DEFAULT_GAS_LIMITS: Record<string, number> = {
  depositWithSig: 350_000,
  depositWithSigAndPermit: 420_000,
  redeemWithSig: 320_000,
  redeemAndCredit: 380_000,
  bridgeToBase: 450_000,
  withdrawToHorizen: 0,
  egressWithdrawToHorizen: 0,
};

export function gasLimitForKind(kind: RelayKind): number {
  const envKey = (() => {
    switch (kind) {
      case "depositWithSig":
        return "RELAY_GAS_LIMIT_DEPOSIT_WITH_SIG";
      case "depositWithSigAndPermit":
        return "RELAY_GAS_LIMIT_DEPOSIT_WITH_SIG_AND_PERMIT";
      case "redeemWithSig":
        return "RELAY_GAS_LIMIT_REDEEM_WITH_SIG";
      case "redeemAndCredit":
        return "RELAY_GAS_LIMIT_REDEEM_AND_CREDIT";
      case "bridgeToBase":
        return "RELAY_GAS_LIMIT_BRIDGE_TO_BASE";
      default:
        return undefined;
    }
  })();
  const fallback = DEFAULT_GAS_LIMITS[kind] ?? 0;
  if (!envKey) return fallback;
  return parseIntEnv(envKey, fallback);
}

export function stLighterAddress(): `0x${string}` | undefined {
  const v = process.env.NEXT_PUBLIC_HORIZEN_STLIGHTER_ADDRESS?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined;
}

export function inboundStationAddress(): `0x${string}` | undefined {
  const v = process.env.NEXT_PUBLIC_HORIZEN_INBOUND_STATION_ADDRESS?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined;
}

export function egressStationAddress(): `0x${string}` | undefined {
  const v = process.env.NEXT_PUBLIC_HORIZEN_EGRESS_STATION_ADDRESS?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined;
}

export function zenOftStationBridgeAddress(): `0x${string}` | undefined {
  const v = process.env.NEXT_PUBLIC_HORIZEN_ZEN_OFT_STATION_BRIDGE_ADDRESS?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined;
}

export function ltZenAddress(): `0x${string}` | undefined {
  const v = process.env.NEXT_PUBLIC_HORIZEN_LTZEN_ADDRESS?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined;
}

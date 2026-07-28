/**
 * ZEN/ETH FX quote (fee-spec §3).
 * Live default: Base Aerodrome Slipstream ZEN/WETH pool `slot0` (deep CL pool).
 * Do NOT use the thin vAMM WETH/ZEN pair — it prices ~1e4× off spot.
 * Optional: PRICE_PROVIDER=coingecko (`zencash` id). Fallback: ZEN_PER_ETH_FLOOR.
 */

import { createPublicClient, http, type Address } from "viem";
import { base } from "viem/chains";
import {
  aerodromeWethAddress,
  aerodromeZenAddress,
  aerodromeZenWethPoolAddress,
  basePriceRpcUrl,
  priceApiKey,
  priceApiUrl,
  priceDeviationBps,
  priceProviderId,
  quoteTtlSec,
  zenPerEthFloor,
} from "./config";
import { relayError, relayLog } from "./log";

export type RateSource = "live" | "floor";

export type ZenEthQuote = {
  zenPerEth: bigint;
  rateSource: RateSource;
  asOf: number;
  providerId: string;
};

type CacheEntry = { quote: ZenEthQuote; expiresAtMs: number };

let cache: CacheEntry | undefined;

const SLIPSTREAM_POOL_ABI = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export function ceilDiv(a: bigint, b: bigint): bigint {
  if (a === 0n) return 0n;
  if (b <= 0n) throw new Error("ceilDiv: b must be positive");
  return (a + b - 1n) / b;
}

/** abs(live - floor) / floor > deviationBps/10000 → use floor. */
export function shouldClampToFloor(live: bigint, floor: bigint, deviationBps: bigint): boolean {
  if (floor === 0n) return false;
  const diff = live > floor ? live - floor : floor - live;
  return diff * 10_000n > floor * deviationBps;
}

/**
 * Uniswap-V3 / Slipstream spot: token1 per token0 from sqrtPriceX96, 1e18-scaled.
 * zenPerEth when token0=WETH and token1=ZEN; invert when tokens are swapped.
 */
export function amount1PerAmount0FromSqrtPriceX96(sqrtPriceX96: bigint): bigint {
  if (sqrtPriceX96 <= 0n) throw new Error("sqrtPriceX96 <= 0");
  const Q192 = 2n ** 192n;
  const scale = 10n ** 18n;
  return (sqrtPriceX96 * sqrtPriceX96 * scale) / Q192;
}

function basePriceClient() {
  return createPublicClient({
    chain: base,
    transport: http(basePriceRpcUrl()),
  });
}

function sameAddr(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Spot ZEN/ETH via Aerodrome Slipstream ZEN/WETH pool (deep liquidity).
 * UI route ETH→cbBTC→ZEN ≈ same mid; this pool is the direct ZEN/WETH CL market.
 */
export async function fetchAerodromeZenPerEth(): Promise<{ zenPerEth: bigint; asOf: number }> {
  const client = basePriceClient();
  const pool = aerodromeZenWethPoolAddress();
  const weth = aerodromeWethAddress();
  const zen = aerodromeZenAddress();

  const [token0, token1, slot0] = await Promise.all([
    client.readContract({ address: pool, abi: SLIPSTREAM_POOL_ABI, functionName: "token0" }),
    client.readContract({ address: pool, abi: SLIPSTREAM_POOL_ABI, functionName: "token1" }),
    client.readContract({ address: pool, abi: SLIPSTREAM_POOL_ABI, functionName: "slot0" }),
  ]);

  const sqrtPriceX96 = slot0[0] as bigint;
  const amount1Per0 = amount1PerAmount0FromSqrtPriceX96(sqrtPriceX96);

  let zenPerEth: bigint;
  if (sameAddr(token0 as Address, weth) && sameAddr(token1 as Address, zen)) {
    // token1/token0 = ZEN per WETH
    zenPerEth = amount1Per0;
  } else if (sameAddr(token0 as Address, zen) && sameAddr(token1 as Address, weth)) {
    // token1/token0 = WETH per ZEN → invert
    if (amount1Per0 <= 0n) throw new Error("aerodrome ethPerZen <= 0");
    zenPerEth = (10n ** 18n * 10n ** 18n) / amount1Per0;
  } else {
    throw new Error(
      `aerodrome pool tokens mismatch: token0=${token0} token1=${token1} expected WETH/ZEN`,
    );
  }

  if (zenPerEth <= 0n) throw new Error("aerodrome zenPerEth <= 0");
  return { zenPerEth, asOf: Math.floor(Date.now() / 1000) };
}

/** CoinGecko: use `zencash` (Horizen rebrand). Legacy `horizen` id often missing. */
async function fetchCoinGeckoZenPerEth(): Promise<{ zenPerEth: bigint; asOf: number }> {
  const url =
    priceApiUrl() ??
    "https://api.coingecko.com/api/v3/simple/price?ids=zencash,ethereum&vs_currencies=usd";
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = priceApiKey();
  if (key) headers["x-cg-pro-api-key"] = key;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`price API HTTP ${res.status}`);
  const body = (await res.json()) as {
    zencash?: { usd?: number };
    horizen?: { usd?: number };
    ethereum?: { usd?: number };
  };
  const zenUsd = body.zencash?.usd ?? body.horizen?.usd;
  const ethUsd = body.ethereum?.usd;
  if (!zenUsd || !ethUsd || zenUsd <= 0 || ethUsd <= 0) {
    throw new Error("price API missing zencash/ethereum usd");
  }
  const scale = 10n ** 18n;
  const ethScaled = BigInt(Math.round(ethUsd * 1e8));
  const zenScaled = BigInt(Math.round(zenUsd * 1e8));
  const zenPerEth = (ethScaled * scale) / zenScaled;
  if (zenPerEth <= 0n) throw new Error("computed zenPerEth <= 0");
  return { zenPerEth, asOf: Math.floor(Date.now() / 1000) };
}

async function fetchLiveZenPerEth(): Promise<{ zenPerEth: bigint; asOf: number; providerId: string }> {
  const id = priceProviderId();
  if (id === "aerodrome" || id === "aerodrome-base") {
    const r = await fetchAerodromeZenPerEth();
    return { ...r, providerId: "aerodrome" };
  }
  if (id === "coingecko" || id === "coingecko-pro") {
    const r = await fetchCoinGeckoZenPerEth();
    return { ...r, providerId: id };
  }
  throw new Error(`unknown PRICE_PROVIDER: ${id}`);
}

function floorQuote(asOf = Math.floor(Date.now() / 1000)): ZenEthQuote | undefined {
  const floor = zenPerEthFloor();
  if (!floor) return undefined;
  return {
    zenPerEth: floor,
    rateSource: "floor",
    asOf,
    providerId: "floor",
  };
}

/**
 * Resolve ZEN/ETH quote with cache, live fetch, deviation clamp, and floor fallback.
 * Throws if neither live nor floor is available.
 */
export async function getZenEthQuote(opts?: { bypassCache?: boolean }): Promise<ZenEthQuote> {
  const now = Date.now();
  if (!opts?.bypassCache && cache && cache.expiresAtMs > now) {
    return cache.quote;
  }

  const ttlMs = quoteTtlSec() * 1000;
  const floor = zenPerEthFloor();
  const deviation = priceDeviationBps();

  try {
    const live = await fetchLiveZenPerEth();
    let quote: ZenEthQuote = {
      zenPerEth: live.zenPerEth,
      rateSource: "live",
      asOf: live.asOf,
      providerId: live.providerId,
    };
    if (floor && shouldClampToFloor(live.zenPerEth, floor, deviation)) {
      relayLog("ZEN/ETH live clamped to floor (deviation)", {
        live: live.zenPerEth.toString(),
        floor: floor.toString(),
        deviationBps: deviation.toString(),
        providerId: live.providerId,
      });
      quote = {
        zenPerEth: floor,
        rateSource: "floor",
        asOf: live.asOf,
        providerId: "floor",
      };
    }
    cache = { quote, expiresAtMs: now + ttlMs };
    relayLog("ZEN/ETH quote ok", {
      zenPerEth: quote.zenPerEth.toString(),
      rateSource: quote.rateSource,
      providerId: quote.providerId,
    });
    return quote;
  } catch (err) {
    relayError("ZEN/ETH live quote failed", err);
    const fb = floorQuote();
    if (!fb) throw new Error("quote_unavailable");
    cache = { quote: fb, expiresAtMs: now + ttlMs };
    return fb;
  }
}

/** Test helper: clear in-process cache. */
export function clearZenEthQuoteCache(): void {
  cache = undefined;
}

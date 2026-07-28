/**
 * Cost-oriented feeZen / maxFeeZen (fee-spec §2).
 */

import type { Address, Hex } from "viem";
import { createPublicClient, http } from "viem";
import ZenOftStationBridgeAbi from "@/abi/ZenOftStationBridge.json";
import { horizen, HUB_CHAIN_ID } from "@/config/chains";
import { truncateOftAmountLD } from "@/lib/oftDust";
import type { RelayKind } from "@/relayer/types";
import {
  feeBufferBps,
  feeMarginBps,
  feeProfitBps,
  gasCeilMaxFeeWei,
  gasLimitForKind,
  gasPriceProviderUrl,
  MAX_GAS_FEE_ZEN,
  zenOftStationBridgeAddress,
} from "./config";
import { ceilDiv, getZenEthQuote, type RateSource } from "./quote";
import { relayError, relayLog } from "./log";

export type CostErrorCode =
  | "amount_too_small"
  | "fee_hits_cap"
  | "invalid_params"
  | "quote_unavailable"
  | "bridge_quote_failed"
  | "fee_quote_stale";

export class RelayCostError extends Error {
  readonly code: CostErrorCode;
  readonly feeZen?: string;
  readonly requiredMaxFeeZen?: string;

  constructor(
    code: CostErrorCode,
    message: string,
    extra?: { feeZen?: bigint; requiredMaxFeeZen?: bigint },
  ) {
    super(message);
    this.name = "RelayCostError";
    this.code = code;
    if (extra?.feeZen !== undefined) this.feeZen = extra.feeZen.toString();
    if (extra?.requiredMaxFeeZen !== undefined) {
      this.requiredMaxFeeZen = extra.requiredMaxFeeZen.toString();
    }
  }
}

export type FeeBreakdown = {
  l3GasWei: bigint;
  lzNativeWei: bigint;
  ethCostWei: bigint;
  zenPerEth: bigint;
  rateSource: RateSource;
  rateAsOf: number;
  effectiveGasPrice: bigint;
  gasLimit: number;
  bufferBps: bigint;
  marginBps: bigint;
  profitBps: bigint;
};

export type CostOk = {
  ok: true;
  feeZen: bigint;
  maxFeeZen: bigint;
  basis: bigint;
  breakdown: FeeBreakdown;
};

export type CostFail = {
  ok: false;
  code: CostErrorCode;
};

export type CostResult = CostOk | CostFail;

export type ComputeCostParams = {
  kind: RelayKind;
  basis: bigint;
  /** Injected for tests / when already resolved. */
  zenPerEth: bigint;
  rateSource: RateSource;
  rateAsOf: number;
  effectiveGasPrice: bigint;
  lzNativeWei: bigint;
  bufferBps?: bigint;
  marginBps?: bigint;
  profitBps?: bigint;
  gasLimit?: number;
};

const WITHDRAW_KINDS = new Set<RelayKind>(["withdrawToHorizen", "egressWithdrawToHorizen"]);

function minBig(...vals: bigint[]): bigint {
  return vals.reduce((a, b) => (a < b ? a : b));
}

function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/** Parse gas-provider decimal Gwei string (e.g. "1.5" or "0.001") to wei. */
export function gweiDecimalToWei(raw: string): bigint {
  const s = raw.trim();
  if (!s) return 0n;
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const [wholePart, fracPart = ""] = body.split(".");
  const whole = BigInt(wholePart || "0");
  const fracPadded = `${fracPart}000000000`.slice(0, 9);
  const frac = BigInt(fracPadded || "0");
  const wei = whole * 10n ** 9n + frac;
  return neg ? -wei : wei;
}

/**
 * Pure cost formula (fee-spec §2.2 + §2.6). Prefer this in unit tests.
 */
export function computeCostFromInputs(p: ComputeCostParams): CostResult {
  const { kind, basis } = p;
  if (WITHDRAW_KINDS.has(kind) || kind === "bridge") {
    if (kind === "bridge") return { ok: false, code: "invalid_params" };
    return {
      ok: true,
      feeZen: 0n,
      maxFeeZen: 0n,
      basis,
      breakdown: {
        l3GasWei: 0n,
        lzNativeWei: 0n,
        ethCostWei: 0n,
        zenPerEth: p.zenPerEth,
        rateSource: p.rateSource,
        rateAsOf: p.rateAsOf,
        effectiveGasPrice: 0n,
        gasLimit: 0,
        bufferBps: p.bufferBps ?? feeBufferBps(),
        marginBps: p.marginBps ?? feeMarginBps(),
        profitBps: p.profitBps ?? feeProfitBps(),
      },
    };
  }

  const bufferBps = p.bufferBps ?? feeBufferBps();
  const marginBps = p.marginBps ?? feeMarginBps();
  const profitBps = p.profitBps ?? feeProfitBps();
  const gasLimit = p.gasLimit ?? gasLimitForKind(kind);

  const l3GasWei = BigInt(gasLimit) * p.effectiveGasPrice;
  const lzNativeWei = p.lzNativeWei;
  const ethCostWei = l3GasWei + lzNativeWei;

  const feeZenRaw = ceilDiv(ethCostWei * p.zenPerEth, 10n ** 18n);
  const feeZenCost = ceilDiv(feeZenRaw * (10_000n + marginBps), 10_000n);

  if (feeZenCost > MAX_GAS_FEE_ZEN) {
    return { ok: false, code: "fee_hits_cap" };
  }

  const basisCap = basis > 0n ? basis - 1n : 0n;
  const profitFloor =
    profitBps === 0n ? 0n : (basis * profitBps) / 10_000n;
  const feeZen = maxBig(feeZenCost, minBig(profitFloor, MAX_GAS_FEE_ZEN, basisCap));

  if (feeZen === 0n && ethCostWei > 0n) {
    // dust after conversion — still require positive basis room
  }

  if (basis <= 0n || feeZen >= basis || basisCap < feeZen) {
    return { ok: false, code: "amount_too_small" };
  }

  let maxFeeZen = ceilDiv(feeZen * (10_000n + bufferBps), 10_000n);
  maxFeeZen = minBig(maxFeeZen, MAX_GAS_FEE_ZEN, basisCap);

  if (feeZen > maxFeeZen) {
    // Buffer truncation under hard cap made max < fee — treat as cap hit.
    return { ok: false, code: "fee_hits_cap" };
  }

  return {
    ok: true,
    feeZen,
    maxFeeZen,
    basis,
    breakdown: {
      l3GasWei,
      lzNativeWei,
      ethCostWei,
      zenPerEth: p.zenPerEth,
      rateSource: p.rateSource,
      rateAsOf: p.rateAsOf,
      effectiveGasPrice: p.effectiveGasPrice,
      gasLimit,
      bufferBps,
      marginBps,
      profitBps,
    },
  };
}

function hubPublicClient() {
  const rpc =
    process.env.RRELAYER_PROVIDER_URL?.trim() ?? horizen.rpcUrls.default.http[0];
  return createPublicClient({
    chain: horizen,
    transport: http(rpc),
  });
}

/** FAST-tier maxFeePerGas from gas-provider JSON, else eth_gasPrice, clamped. */
export async function resolveEffectiveGasPrice(): Promise<bigint> {
  const ceil = gasCeilMaxFeeWei();
  const providerUrl = gasPriceProviderUrl();
  if (providerUrl) {
    try {
      const url = `${providerUrl.replace(/\/$/, "")}/${HUB_CHAIN_ID}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        const body = (await res.json()) as {
          fast?: { suggestedMaxFeePerGas?: string };
        };
        const raw = body.fast?.suggestedMaxFeePerGas;
        if (raw) {
          // deploy/gas-provider returns decimal Gwei strings (e.g. "1.5").
          let price = gweiDecimalToWei(raw);
          if (price > ceil) price = ceil;
          if (price > 0n) return price;
        }
      }
    } catch (err) {
      relayError("gas-provider fetch failed", err);
    }
  }

  try {
    const client = hubPublicClient();
    let price = await client.getGasPrice();
    if (price > ceil) price = ceil;
    return price > 0n ? price : 1_000_000n;
  } catch (err) {
    relayError("eth_gasPrice failed", err);
    return minBig(1_500_000_000n, ceil); // 1.5 gwei fallback
  }
}

export async function quoteBridgeLzNativeFee(
  amount: bigint,
  dest: Address,
  extraOptions: Hex = "0x",
): Promise<bigint> {
  const bridge = zenOftStationBridgeAddress();
  if (!bridge) throw new RelayCostError("bridge_quote_failed", "ZenOftStationBridge not configured");
  // Mirror ZenOftStationBridge.bridgeZen / quoteBridgeNativeFee: OFT shared-decimal dust
  // must be stripped or quoteSend reverts SlippageExceeded(amountSent, minAmountLD).
  const sendAmount = truncateOftAmountLD(amount);
  if (sendAmount <= 0n) {
    throw new RelayCostError("invalid_params", "bridge amount dust-only after OFT truncation");
  }
  try {
    const client = hubPublicClient();
    const fee = (await client.readContract({
      address: bridge,
      abi: ZenOftStationBridgeAbi,
      functionName: "quoteBridgeNativeFee",
      args: [sendAmount, dest, extraOptions],
    })) as bigint;
    return fee;
  } catch (err) {
    relayError("quoteBridgeNativeFee failed", err, {
      amount: amount.toString(),
      sendAmount: sendAmount.toString(),
      dest,
      extraOptions,
    });
    throw new RelayCostError("bridge_quote_failed", "quoteBridgeNativeFee failed");
  }
}

export type RelayCostRequest = {
  kind: RelayKind;
  basis: bigint;
  amount: bigint;
  dest?: Address;
  extraOptions?: Hex;
  /** Test / override injectors */
  zenPerEth?: bigint;
  rateSource?: RateSource;
  rateAsOf?: number;
  effectiveGasPrice?: bigint;
  lzNativeWei?: bigint;
};

/**
 * Full cost quote for a relay kind. Throws RelayCostError on hard failures.
 */
export async function computeRelayCost(req: RelayCostRequest): Promise<CostOk> {
  if (WITHDRAW_KINDS.has(req.kind)) {
    const r = computeCostFromInputs({
      kind: req.kind,
      basis: req.basis,
      zenPerEth: 0n,
      rateSource: "floor",
      rateAsOf: Math.floor(Date.now() / 1000),
      effectiveGasPrice: 0n,
      lzNativeWei: 0n,
    });
    if (!r.ok) throw new RelayCostError(r.code, r.code);
    return r;
  }

  let zenPerEth = req.zenPerEth;
  let rateSource = req.rateSource;
  let rateAsOf = req.rateAsOf;
  if (zenPerEth === undefined || rateSource === undefined || rateAsOf === undefined) {
    try {
      const q = await getZenEthQuote();
      zenPerEth = q.zenPerEth;
      rateSource = q.rateSource;
      rateAsOf = q.asOf;
    } catch {
      throw new RelayCostError("quote_unavailable", "ZEN/ETH quote unavailable");
    }
  }

  const effectiveGasPrice = req.effectiveGasPrice ?? (await resolveEffectiveGasPrice());

  let lzNativeWei = req.lzNativeWei ?? 0n;
  if (req.kind === "bridgeToBase") {
    if (req.lzNativeWei === undefined) {
      if (!req.dest) {
        throw new RelayCostError("invalid_params", "bridgeToBase requires dest");
      }
      lzNativeWei = await quoteBridgeLzNativeFee(
        req.amount,
        req.dest,
        req.extraOptions ?? "0x",
      );
    }
  }

  const result = computeCostFromInputs({
    kind: req.kind,
    basis: req.basis,
    zenPerEth,
    rateSource,
    rateAsOf,
    effectiveGasPrice,
    lzNativeWei,
  });

  if (!result.ok) {
    throw new RelayCostError(result.code, result.code);
  }

  relayLog("computeRelayCost", {
    kind: req.kind,
    feeZen: result.feeZen.toString(),
    maxFeeZen: result.maxFeeZen.toString(),
    rateSource: result.breakdown.rateSource,
  });

  return result;
}

/**
 * Submit-path guard (fee-spec §4.2): recomputed fee must fit the signed maxFeeZen.
 */
export function assertSignedMaxCoversFee(
  feeZen: bigint,
  signedMax: bigint,
  requiredMaxFeeZen: bigint,
): void {
  if (feeZen > signedMax) {
    throw new RelayCostError(
      "fee_quote_stale",
      "Relayer fee rose above your signed max. Please re-quote and sign again.",
      { feeZen, requiredMaxFeeZen },
    );
  }
}

/** Serialize CostOk for JSON API responses. */
export function serializeCostQuote(cost: CostOk, expiresAt: number) {
  const b = cost.breakdown;
  return {
    feeZen: cost.feeZen.toString(),
    maxFeeZen: cost.maxFeeZen.toString(),
    basis: cost.basis.toString(),
    breakdown: {
      l3GasWei: b.l3GasWei.toString(),
      lzNativeWei: b.lzNativeWei.toString(),
      ethCostWei: b.ethCostWei.toString(),
      zenPerEth: b.zenPerEth.toString(),
      rateSource: b.rateSource,
      rateAsOf: b.rateAsOf,
      effectiveGasPrice: b.effectiveGasPrice.toString(),
      gasLimit: b.gasLimit,
      bufferBps: Number(b.bufferBps),
      marginBps: Number(b.marginBps),
      profitBps: Number(b.profitBps),
    },
    expiresAt,
  };
}

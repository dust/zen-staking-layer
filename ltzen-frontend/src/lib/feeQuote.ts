/**
 * Client helper for GET /api/relay/fee-quote (fee-spec §4.1).
 */

import type { Address, Hex } from "viem";
import type { RelayKind } from "@/relayer/types";

export type FeeQuoteBreakdown = {
  l3GasWei: string;
  lzNativeWei: string;
  ethCostWei: string;
  zenPerEth: string;
  rateSource: "live" | "floor";
  rateAsOf: number;
  effectiveGasPrice: string;
  gasLimit: number;
  bufferBps: number;
  marginBps: number;
  profitBps: number;
};

export type FeeQuote = {
  feeZen: string;
  maxFeeZen: string;
  basis: string;
  breakdown: FeeQuoteBreakdown;
  expiresAt: number;
};

export type FeeQuoteErrorCode =
  | "amount_too_small"
  | "fee_hits_cap"
  | "invalid_params"
  | "quote_unavailable"
  | "bridge_quote_failed"
  | "fee_quote_stale"
  | "unknown";

export class FeeQuoteError extends Error {
  readonly code: FeeQuoteErrorCode;
  readonly feeZen?: string;
  readonly requiredMaxFeeZen?: string;

  constructor(
    code: FeeQuoteErrorCode,
    message: string,
    extra?: { feeZen?: string; requiredMaxFeeZen?: string },
  ) {
    super(message);
    this.name = "FeeQuoteError";
    this.code = code;
    this.feeZen = extra?.feeZen;
    this.requiredMaxFeeZen = extra?.requiredMaxFeeZen;
  }
}

export type FetchFeeQuoteArgs = {
  kind: RelayKind;
  amount?: string;
  dest?: Address;
  extraOptions?: Hex;
  verifyingContract?: Address;
};

export function isQuoteExpired(quote: FeeQuote, nowSec = Math.floor(Date.now() / 1000)): boolean {
  return nowSec >= quote.expiresAt;
}

/** True if quote expires within `skewSec` seconds. */
export function isQuoteExpiringSoon(
  quote: FeeQuote,
  skewSec = 15,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  return nowSec >= quote.expiresAt - skewSec;
}

export async function fetchFeeQuote(args: FetchFeeQuoteArgs): Promise<FeeQuote> {
  const params = new URLSearchParams({ kind: args.kind });
  if (args.amount !== undefined) params.set("amount", args.amount);
  if (args.dest) params.set("dest", args.dest);
  if (args.extraOptions) params.set("extraOptions", args.extraOptions);
  if (args.verifyingContract) params.set("verifyingContract", args.verifyingContract);

  const res = await fetch(`/api/relay/fee-quote?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const body = (await res.json()) as FeeQuote & {
    error?: string;
    code?: string;
    message?: string;
    feeZen?: string;
    requiredMaxFeeZen?: string;
  };

  if (!res.ok) {
    const code = (body.code || body.error || "unknown") as FeeQuoteErrorCode;
    throw new FeeQuoteError(code, body.message || body.error || code, {
      feeZen: body.feeZen,
      requiredMaxFeeZen: body.requiredMaxFeeZen,
    });
  }

  if (!body.feeZen || !body.maxFeeZen || !body.expiresAt || !body.breakdown) {
    throw new FeeQuoteError("unknown", "malformed fee-quote response");
  }

  return {
    feeZen: body.feeZen,
    maxFeeZen: body.maxFeeZen,
    basis: body.basis,
    breakdown: body.breakdown,
    expiresAt: body.expiresAt,
  };
}

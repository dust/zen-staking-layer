import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress, type Address, type Hex } from "viem";
import StLighterAbi from "@/abi/StLighter.json";
import { horizen } from "@/config/chains";
import type { RelayKind } from "@/relayer/types";
import { quoteTtlSec, stLighterAddress } from "@/server/relay/config";
import {
  computeRelayCost,
  RelayCostError,
  serializeCostQuote,
} from "@/server/relay/cost";
import { relayError, relayLog } from "@/server/relay/log";

export const runtime = "nodejs";

const KINDS = new Set<RelayKind>([
  "depositWithSigAndPermit",
  "depositWithSig",
  "redeemWithSig",
  "redeemAndCredit",
  "bridgeToBase",
]);

function hubPublicClient() {
  const rpc =
    process.env.RRELAYER_PROVIDER_URL?.trim() ?? horizen.rpcUrls.default.http[0];
  return createPublicClient({
    chain: horizen,
    transport: http(rpc),
  });
}

function resolveBasis(kind: RelayKind, amount: bigint, verifying?: Address): Promise<bigint> {
  if (
    kind === "depositWithSig" ||
    kind === "depositWithSigAndPermit" ||
    kind === "bridgeToBase"
  ) {
    return Promise.resolve(amount);
  }
  const stLighter = verifying ?? stLighterAddress();
  if (!stLighter) throw new RelayCostError("invalid_params", "StLighter address not configured");
  const client = hubPublicClient();
  return client.readContract({
    address: stLighter,
    abi: StLighterAbi,
    functionName: "previewRedeem",
    args: [amount],
  }) as Promise<bigint>;
}

function httpStatusFor(code: string): number {
  if (code === "quote_unavailable" || code === "bridge_quote_failed") return 503;
  return 400;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") as RelayKind | null;
    if (!kind || !KINDS.has(kind)) {
      return NextResponse.json({ error: "invalid_params", code: "invalid_params" }, { status: 400 });
    }

    const amountRaw = url.searchParams.get("amount");
    if (!amountRaw) {
      return NextResponse.json({ error: "invalid_params", code: "invalid_params" }, { status: 400 });
    }
    let amount = 0n;
    try {
      amount = BigInt(amountRaw);
    } catch {
      return NextResponse.json({ error: "invalid_params", code: "invalid_params" }, { status: 400 });
    }
    if (amount <= 0n) {
      return NextResponse.json({ error: "invalid_params", code: "invalid_params" }, { status: 400 });
    }

    const destRaw = url.searchParams.get("dest");
    let dest: Address | undefined;
    if (kind === "bridgeToBase") {
      if (!destRaw || !isAddress(destRaw)) {
        return NextResponse.json({ error: "invalid_params", code: "invalid_params" }, { status: 400 });
      }
      dest = destRaw as Address;
    }

    const extraOptions = (url.searchParams.get("extraOptions") as Hex | null) ?? undefined;
    const verifyingRaw = url.searchParams.get("verifyingContract");
    const verifying =
      verifyingRaw && isAddress(verifyingRaw) ? (verifyingRaw as Address) : undefined;

    const basis = await resolveBasis(kind, amount, verifying);
    const cost = await computeRelayCost({
      kind,
      basis,
      amount,
      dest,
      extraOptions,
    });

    const expiresAt = Math.floor(Date.now() / 1000) + quoteTtlSec();
    relayLog("GET /api/relay/fee-quote", {
      kind,
      feeZen: cost.feeZen.toString(),
      maxFeeZen: cost.maxFeeZen.toString(),
    });
    return NextResponse.json(serializeCostQuote(cost, expiresAt));
  } catch (err) {
    relayError("GET /api/relay/fee-quote failed", err);
    if (err instanceof RelayCostError) {
      return NextResponse.json(
        {
          error: err.code,
          code: err.code,
          message: err.message,
          feeZen: err.feeZen,
          requiredMaxFeeZen: err.requiredMaxFeeZen,
        },
        { status: httpStatusFor(err.code) },
      );
    }
    const message = err instanceof Error ? err.message : "fee quote failed";
    const code = message === "quote_unavailable" ? "quote_unavailable" : "invalid_params";
    return NextResponse.json({ error: code, code, message }, { status: httpStatusFor(code) });
  }
}

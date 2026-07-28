import { NextResponse } from "next/server";
import type { RelayRequest } from "@/relayer/types";
import { RelayCostError } from "@/server/relay/cost";
import { relayError, relayLog } from "@/server/relay/log";
import { queueRelay } from "@/server/relay/submit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const started = Date.now();
  try {
    const body = (await request.json()) as RelayRequest;
    relayLog("POST /api/relay received", {
      kind: body.kind,
      user: body.user,
      amount: body.amount,
      deadline: body.deadline,
    });
    const { id, feeZen } = await queueRelay(body);
    relayLog("POST /api/relay accepted", {
      id,
      feeZen,
      ms: Date.now() - started,
    });
    return NextResponse.json({ id, feeZen, status: "submitting" });
  } catch (err) {
    relayError("POST /api/relay rejected", err, { ms: Date.now() - started });
    if (err instanceof RelayCostError) {
      const status = err.code === "fee_quote_stale" ? 409 : err.code === "quote_unavailable" ? 503 : 400;
      return NextResponse.json(
        {
          error: err.code,
          code: err.code,
          message: err.message,
          feeZen: err.feeZen,
          requiredMaxFeeZen: err.requiredMaxFeeZen,
        },
        { status },
      );
    }
    const message = err instanceof Error ? err.message : "relay rejected";
    const status = message.includes("not configured") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

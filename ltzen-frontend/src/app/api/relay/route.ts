import { NextResponse } from "next/server";
import type { RelayRequest } from "@/relayer/types";
import { queueRelay } from "@/server/relay/submit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RelayRequest;
    const { id, feeZen } = await queueRelay(body);
    return NextResponse.json({ id, feeZen, status: "submitting" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "relay rejected";
    const status = message.includes("not configured") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

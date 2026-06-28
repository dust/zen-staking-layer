import { NextResponse } from "next/server";
import { getJob } from "@/server/relay/jobs";
import { relayLog, relayVerbose } from "@/server/relay/log";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const job = getJob(id);
  if (!job) {
    relayLog("GET /api/relay/{id} unknown job", { id });
    return NextResponse.json({ error: "unknown relay id" }, { status: 404 });
  }

  if (relayVerbose()) {
    relayLog("GET /api/relay/{id} poll", {
      id,
      status: job.status,
      txHash: job.txHash,
      error: job.error,
    });
  }

  return NextResponse.json({
    status: job.status,
    txHash: job.txHash,
    feeZen: job.feeZen,
    error: job.error,
  });
}

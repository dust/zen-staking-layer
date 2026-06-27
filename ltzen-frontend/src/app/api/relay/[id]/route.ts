import { NextResponse } from "next/server";
import { getJob } from "@/server/relay/jobs";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "unknown relay id" }, { status: 404 });
  }

  return NextResponse.json({
    status: job.status,
    txHash: job.txHash,
    feeZen: job.feeZen,
    error: job.error,
  });
}

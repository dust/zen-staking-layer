import type { Hex } from "viem";
import type { RelayStatus } from "@/relayer/types";
import { relayLog } from "./log";

export interface RelayJob {
  status: RelayStatus;
  txHash?: Hex;
  /** rrelayer internal transaction id (for status polling). */
  rrelayerTxId?: string;
  feeZen?: string;
  error?: string;
  createdAt: number;
}

const globalJobs = globalThis as unknown as { __ltzenRelayJobs?: Map<string, RelayJob> };

function store(): Map<string, RelayJob> {
  if (!globalJobs.__ltzenRelayJobs) globalJobs.__ltzenRelayJobs = new Map();
  return globalJobs.__ltzenRelayJobs;
}

export function createJob(id: string): RelayJob {
  const job: RelayJob = { status: "submitting", createdAt: Date.now() };
  store().set(id, job);
  return job;
}

export function getJob(id: string): RelayJob | undefined {
  return store().get(id);
}

export function patchJob(id: string, patch: Partial<RelayJob>): RelayJob | undefined {
  const job = store().get(id);
  if (!job) return undefined;
  const next = { ...job, ...patch };
  store().set(id, next);
  if (patch.status !== undefined || patch.error !== undefined || patch.txHash !== undefined) {
    relayLog("job updated", {
      id,
      status: next.status,
      txHash: next.txHash,
      error: next.error,
    });
  }
  return next;
}

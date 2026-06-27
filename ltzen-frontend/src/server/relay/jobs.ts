import type { Hex } from "viem";
import type { RelayStatus } from "@/relayer/types";

export interface RelayJob {
  status: RelayStatus;
  txHash?: Hex;
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
  return next;
}

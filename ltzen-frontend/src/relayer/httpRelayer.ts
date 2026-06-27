/**
 * HTTP relayer (frontend-plan §2 — the ONE concrete file bound to a wire protocol).
 *
 * Assumed protocol (placeholder until a real relayer is specified — see frontend-plan red line:
 * "swapping relayers = change relayer.ts + this file only"):
 *   POST {endpoint}/relay          → { id }            submit a signed meta-tx
 *   GET  {endpoint}/relay/{id}     → { status, txHash, feeZen, error }   poll status
 *
 * We poll because a generic relayer may not offer websockets. The polling loop maps the server's
 * status into our RelayStatus state machine and fires a timeout if nothing lands in time. If/when
 * the real relayer differs, THIS is the only file that changes.
 */

import type { Relayer, RelayRequest, RelayResult, RelayHandle, RelayStatus } from "./types";

const POLL_MS = 1_500;
const TIMEOUT_MS = 30_000;

function resolveEndpoint(base: string, path: string): string {
  if (base.startsWith("http://") || base.startsWith("https://")) {
    return `${base.replace(/\/$/, "")}${path}`;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}${base.replace(/\/$/, "")}${path}`;
  }
  return `${base.replace(/\/$/, "")}${path}`;
}

interface ServerStatus {
  status?: string;
  txHash?: `0x${string}`;
  feeZen?: string;
  error?: string;
}

function mapStatus(s: string | undefined): RelayStatus {
  switch (s) {
    case "pending":
    case "submitted":
    case "broadcasting":
      return "relaying";
    case "confirmed":
    case "mined":
    case "success":
      return "confirmed";
    case "failed":
    case "reverted":
      return "failed";
    default:
      return "relaying";
  }
}

class HttpRelayHandle implements RelayHandle {
  readonly id: string;
  private result: RelayResult = { status: "submitting" };
  private readonly listeners = new Set<(r: RelayResult) => void>();
  private stopped = false;

  constructor(
    id: string,
    private readonly endpoint: string,
  ) {
    this.id = id;
    void this.poll();
  }

  private emit(next: RelayResult) {
    this.result = next;
    for (const l of this.listeners) l(next);
    if (next.status === "confirmed" || next.status === "failed" || next.status === "timeout") {
      this.stopped = true;
    }
  }

  private async poll() {
    const deadline = Date.now() + TIMEOUT_MS;
    this.emit({ status: "relaying" });

    while (!this.stopped) {
      if (Date.now() > deadline) {
        this.emit({ status: "timeout" });
        return;
      }
      try {
        const res = await fetch(resolveEndpoint(this.endpoint, `/relay/${this.id}`), {
          headers: { accept: "application/json" },
        });
        if (res.ok) {
          const body = (await res.json()) as ServerStatus;
          const status = mapStatus(body.status);
          this.emit({ status, txHash: body.txHash, feeZen: body.feeZen, error: body.error });
          if (this.stopped) return;
        }
      } catch {
        // transient — keep polling until the deadline (don't kill the track on one bad fetch).
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  subscribe(listener: (r: RelayResult) => void): () => void {
    this.listeners.add(listener);
    listener(this.result);
    return () => {
      this.listeners.delete(listener);
    };
  }

  current(): RelayResult {
    return this.result;
  }
}

export class HttpRelayer implements Relayer {
  readonly label: string;

  constructor(private readonly endpoint: string) {
    this.label = endpoint;
  }

  async submit(req: RelayRequest): Promise<RelayHandle> {
    const res = await fetch(resolveEndpoint(this.endpoint, "/relay"), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      throw new Error(`relayer rejected submission (${res.status})`);
    }
    const { id } = (await res.json()) as { id: string };
    return new HttpRelayHandle(id, this.endpoint);
  }
}

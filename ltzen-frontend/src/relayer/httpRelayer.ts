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
import { relayClientLog } from "./relayDebug";

const POLL_MS = 1_500;
const TIMEOUT_MS = 120_000;

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

/** Map BFF / external relayer status strings into our RelayStatus state machine. */
function mapStatus(s: string | undefined): RelayStatus {
  switch (s) {
    case "submitting":
    case "pending":
    case "submitted":
    case "broadcasting":
    case "relaying":
      return "relaying";
    case "confirmed":
    case "mined":
    case "success":
      return "confirmed";
    case "failed":
    case "reverted":
      return "failed";
    case "timeout":
      return "timeout";
    default:
      relayClientLog("mapStatus: unknown server status, treating as relaying", { status: s });
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
    relayClientLog("poll start", { id: this.id, endpoint: this.endpoint });

    while (!this.stopped) {
      if (Date.now() > deadline) {
        relayClientLog("poll timeout", { id: this.id });
        this.emit({ status: "timeout" });
        return;
      }
      try {
        const url = resolveEndpoint(this.endpoint, `/relay/${this.id}`);
        const res = await fetch(url, {
          headers: { accept: "application/json" },
        });
        if (res.ok) {
          const body = (await res.json()) as ServerStatus;
          const status = mapStatus(body.status);
          relayClientLog("poll tick", {
            id: this.id,
            httpStatus: res.status,
            serverStatus: body.status,
            mapped: status,
            txHash: body.txHash,
            error: body.error,
          });
          this.emit({ status, txHash: body.txHash, feeZen: body.feeZen, error: body.error });
          if (this.stopped) return;
        } else {
          relayClientLog("poll http error", { id: this.id, httpStatus: res.status });
        }
      } catch (err) {
        relayClientLog("poll fetch error", {
          id: this.id,
          error: err instanceof Error ? err.message : String(err),
        });
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
    const url = resolveEndpoint(this.endpoint, "/relay");
    relayClientLog("submit POST", { url, kind: req.kind, user: req.user });
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) detail = `: ${body.error}`;
      } catch {
        /* ignore */
      }
      relayClientLog("submit rejected", { httpStatus: res.status, detail });
      throw new Error(`relayer rejected submission (${res.status})${detail}`);
    }
    const payload = (await res.json()) as { id: string; feeZen?: string };
    relayClientLog("submit accepted", { id: payload.id, feeZen: payload.feeZen });
    return new HttpRelayHandle(payload.id, this.endpoint);
  }
}

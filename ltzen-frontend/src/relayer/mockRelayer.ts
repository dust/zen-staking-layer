/**
 * Mock relayer — UI simulation only. Fee is a placeholder ~0.5% of amount (capped by
 * maxFeeZen), NOT the production cost model in docs/stLighter-gasless-fee-spec.md.
 * Production uses BFF computeRelayCost via /api/relay.
 */

import type { Relayer, RelayRequest, RelayResult, RelayHandle } from "./types";

const SUBMIT_MS = 600;
const RELAY_MS = 2_200;
const TIMEOUT_MS = 8_000;

let counter = 0;

function fakeTxHash(): `0x${string}` {
  const hex = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `0x${hex}`;
}

/** A relayer fee is a small flat-ish cut; mock it as ~0.5% of amount, capped by maxFeeZen. */
function mockFee(req: RelayRequest): string {
  try {
    const amount = BigInt(req.amount);
    const maxFee = BigInt(req.maxFeeZen);
    const fee = amount / 200n; // 0.5%
    return (fee < maxFee ? fee : maxFee).toString();
  } catch {
    return "0";
  }
}

class MockRelayHandle implements RelayHandle {
  readonly id: string;
  private result: RelayResult = { status: "submitting" };
  private readonly listeners = new Set<(r: RelayResult) => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(req: RelayRequest, forceTimeout: boolean) {
    this.id = `mock-${++counter}`;
    this.run(req, forceTimeout);
  }

  private emit(next: RelayResult) {
    this.result = next;
    for (const l of this.listeners) l(next);
  }

  private run(req: RelayRequest, forceTimeout: boolean) {
    this.timers.push(
      setTimeout(() => this.emit({ status: "relaying" }), SUBMIT_MS),
    );

    if (forceTimeout) {
      this.timers.push(
        setTimeout(() => this.emit({ status: "timeout" }), TIMEOUT_MS),
      );
      return;
    }

    this.timers.push(
      setTimeout(
        () =>
          this.emit({
            status: "confirmed",
            txHash: fakeTxHash(),
            feeZen: mockFee(req),
          }),
        RELAY_MS,
      ),
    );
  }

  subscribe(listener: (r: RelayResult) => void): () => void {
    this.listeners.add(listener);
    listener(this.result); // push current snapshot immediately
    return () => {
      this.listeners.delete(listener);
    };
  }

  current(): RelayResult {
    return this.result;
  }
}

export class MockRelayer implements Relayer {
  readonly label = "Mock relayer (dev)";
  private readonly forceTimeout: boolean;

  constructor() {
    this.forceTimeout = process.env.NEXT_PUBLIC_MOCK_RELAYER_TIMEOUT === "1";
  }

  async submit(req: RelayRequest): Promise<RelayHandle> {
    return new MockRelayHandle(req, this.forceTimeout);
  }
}

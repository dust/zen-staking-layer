/**
 * Direct contract relayer (M2/M3 testnet — no backend relayer required).
 *
 * After the user signs the meta-tx off-chain, this implementation broadcasts the matching
 * StLighter entrypoint from the connected wallet:
 *   - depositWithSigAndPermit (deposit): DepositWithSig + ZEN Permit, no separate approve.
 *   - redeemWithSig (redeem): RedeemWithSig only — redeem burns ltZEN internally, no permit.
 * The user pays gas for that one transaction. Production will swap to HttpRelayer so the relayer
 * wallet submits and the fee is taken from the proceeds.
 */

import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import type { Config } from "wagmi";
import type { Hex } from "viem";
import { abis } from "@/config/contracts";
import type { Relayer, RelayRequest, RelayResult, RelayHandle } from "./types";

class DirectRelayHandle implements RelayHandle {
  readonly id: string;
  private result: RelayResult = { status: "submitting" };
  private readonly listeners = new Set<(r: RelayResult) => void>();

  constructor(
    private readonly config: Config,
    private readonly chainId: number,
    id: string,
    private readonly run: () => Promise<Hex>,
  ) {
    this.id = id;
    void this.execute();
  }

  private emit(next: RelayResult) {
    this.result = next;
    for (const l of this.listeners) l(next);
  }

  private async execute() {
    try {
      this.emit({ status: "relaying" });
      const hash = await this.run();
      await waitForTransactionReceipt(this.config, {
        hash,
        chainId: this.chainId as never,
      });
      this.emit({ status: "confirmed", txHash: hash, feeZen: "0" });
    } catch (err) {
      this.emit({
        status: "failed",
        error: err instanceof Error ? err.message : "transaction failed",
      });
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

let counter = 0;

export class DirectContractRelayer implements Relayer {
  readonly label = "Direct submit (testnet)";

  constructor(private readonly config: Config) {}

  async submit(req: RelayRequest): Promise<RelayHandle> {
    const id = `direct-${++counter}`;
    const feeZen = 0n;

    if (req.kind === "depositWithSigAndPermit") {
      if (!req.permit) {
        throw new Error("depositWithSigAndPermit requires a ZEN permit signature");
      }
      const permit = req.permit;
      return new DirectRelayHandle(
        this.config,
        req.chainId,
        id,
        async () =>
          writeContract(this.config, {
            chainId: req.chainId,
            address: req.verifyingContract,
            abi: abis.stLighter,
            functionName: "depositWithSigAndPermit",
            args: [
              BigInt(req.amount),
              req.receiver,
              BigInt(req.maxFeeZen),
              feeZen,
              req.user,
              req.user,
              BigInt(req.deadline),
              req.signature,
              BigInt(permit.deadline),
              permit.v,
              permit.r,
              permit.s,
            ],
          }),
      );
    }

    if (req.kind === "redeemWithSig") {
      return new DirectRelayHandle(
        this.config,
        req.chainId,
        id,
        async () =>
          writeContract(this.config, {
            chainId: req.chainId,
            address: req.verifyingContract,
            abi: abis.stLighter,
            functionName: "redeemWithSig",
            args: [
              BigInt(req.amount),
              req.receiver,
              BigInt(req.maxFeeZen),
              feeZen,
              req.user,
              BigInt(req.deadline),
              req.signature,
            ],
          }),
      );
    }

    throw new Error(`DirectContractRelayer does not support kind "${req.kind}"`);
  }
}

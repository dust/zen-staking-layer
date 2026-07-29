/**
 * Direct contract relayer — user wallet broadcasts (no BFF/rrelayer).
 * Used for testnet gasless paths when BFF is off, and always for Station
 * escape-hatch withdraws (`withdrawToHorizen` / `egressWithdrawToHorizen`).
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
      const payer = req.payer ?? req.user;
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
              payer,
              req.relayer,
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

    if (req.kind === "depositWithSig") {
      if (!req.payer) throw new Error("depositWithSig requires payer");
      const payer = req.payer;
      return new DirectRelayHandle(
        this.config,
        req.chainId,
        id,
        async () =>
          writeContract(this.config, {
            chainId: req.chainId,
            address: req.verifyingContract,
            abi: abis.stLighter,
            functionName: "depositWithSig",
            args: [
              BigInt(req.amount),
              req.receiver,
              BigInt(req.maxFeeZen),
              feeZen,
              payer,
              req.relayer,
              req.user,
              BigInt(req.deadline),
              req.signature,
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
              req.relayer,
              req.user,
              BigInt(req.deadline),
              req.signature,
            ],
          }),
      );
    }

    if (req.kind === "redeemAndCredit") {
      return new DirectRelayHandle(
        this.config,
        req.chainId,
        id,
        async () =>
          writeContract(this.config, {
            chainId: req.chainId,
            address: req.verifyingContract,
            abi: abis.egressStation,
            functionName: "redeemAndCredit",
            args: [
              BigInt(req.amount),
              BigInt(req.maxFeeZen),
              feeZen,
              req.relayer,
              req.user,
              BigInt(req.deadline),
              req.signature,
            ],
          }),
      );
    }

    if (req.kind === "withdrawToHorizen") {
      return new DirectRelayHandle(
        this.config,
        req.chainId,
        id,
        async () =>
          writeContract(this.config, {
            chainId: req.chainId,
            address: req.verifyingContract,
            abi: abis.inboundStation,
            functionName: "withdrawToHorizen",
            args: [
              BigInt(req.amount),
              req.receiver,
              req.user,
              BigInt(req.deadline),
              req.signature,
            ],
          }),
      );
    }

    if (req.kind === "bridgeToBase") {
      const value = BigInt(req.nativeValue ?? "0");
      if (value <= 0n) throw new Error("bridgeToBase requires nativeValue > 0");
      const extraOptions = req.extraOptions ?? ("0x" as Hex);
      return new DirectRelayHandle(
        this.config,
        req.chainId,
        id,
        async () =>
          writeContract(this.config, {
            chainId: req.chainId,
            address: req.verifyingContract,
            abi: abis.egressStation,
            functionName: "bridgeToBase",
            args: [
              BigInt(req.amount),
              req.receiver,
              BigInt(req.maxFeeZen),
              feeZen,
              req.relayer,
              req.user,
              BigInt(req.deadline),
              req.signature,
              extraOptions,
            ],
            value,
          }),
      );
    }

    if (req.kind === "egressWithdrawToHorizen") {
      return new DirectRelayHandle(
        this.config,
        req.chainId,
        id,
        async () =>
          writeContract(this.config, {
            chainId: req.chainId,
            address: req.verifyingContract,
            abi: abis.egressStation,
            functionName: "withdrawToHorizen",
            args: [
              BigInt(req.amount),
              req.receiver,
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

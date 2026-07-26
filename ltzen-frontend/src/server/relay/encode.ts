import { encodeFunctionData, type Address, type Hex } from "viem";
import StLighterAbi from "@/abi/StLighter.json";
import InboundStationAbi from "@/abi/InboundStation.json";
import EgressStationAbi from "@/abi/EgressStation.json";
import type { RelayRequest } from "@/relayer/types";

export interface EncodedMetaTx {
  to: Address;
  data: Hex;
  feeZen: bigint;
  /** Native wei for payable bridgeToBase (0 when unused). */
  value: bigint;
}

type StLighterFn = "depositWithSigAndPermit" | "depositWithSig" | "redeemWithSig";
type StationFn = "withdrawToHorizen";
type EgressFn = "redeemAndCredit" | "bridgeToBase" | "withdrawToHorizen";

/** Args passed to meta-tx entrypoints (shared by encode + simulate). */
export function metaTxContractCall(
  req: RelayRequest,
  feeZen: bigint,
):
  | { target: "stLighter"; functionName: StLighterFn; args: readonly unknown[]; value: bigint }
  | { target: "inboundStation"; functionName: StationFn; args: readonly unknown[]; value: bigint }
  | { target: "egressStation"; functionName: EgressFn; args: readonly unknown[]; value: bigint } {
  if (req.kind === "redeemWithSig") {
    return {
      target: "stLighter",
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
      value: 0n,
    };
  }

  if (req.kind === "redeemAndCredit") {
    return {
      target: "egressStation",
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
      value: 0n,
    };
  }

  if (req.kind === "depositWithSigAndPermit") {
    if (!req.permit) throw new Error("depositWithSigAndPermit requires permit");
    const p = req.permit;
    const payer = req.payer ?? req.user;
    return {
      target: "stLighter",
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
        BigInt(p.deadline),
        p.v,
        p.r,
        p.s,
      ],
      value: 0n,
    };
  }

  if (req.kind === "depositWithSig") {
    const payer = req.payer;
    if (!payer) throw new Error("depositWithSig requires payer");
    return {
      target: "stLighter",
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
      value: 0n,
    };
  }

  if (req.kind === "withdrawToHorizen") {
    return {
      target: "inboundStation",
      functionName: "withdrawToHorizen",
      args: [
        BigInt(req.amount),
        req.receiver,
        req.user,
        BigInt(req.deadline),
        req.signature,
      ],
      value: 0n,
    };
  }

  if (req.kind === "bridgeToBase") {
    const value = BigInt(req.nativeValue ?? "0");
    if (value <= 0n) throw new Error("bridgeToBase requires nativeValue > 0");
    const extraOptions = (req.extraOptions ?? "0x") as Hex;
    return {
      target: "egressStation",
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
    };
  }

  if (req.kind === "egressWithdrawToHorizen") {
    return {
      target: "egressStation",
      functionName: "withdrawToHorizen",
      args: [
        BigInt(req.amount),
        req.receiver,
        req.user,
        BigInt(req.deadline),
        req.signature,
      ],
      value: 0n,
    };
  }

  throw new Error(`unsupported relay kind: ${req.kind}`);
}

function abiForTarget(
  target: "stLighter" | "inboundStation" | "egressStation",
): typeof StLighterAbi | typeof InboundStationAbi | typeof EgressStationAbi {
  if (target === "stLighter") return StLighterAbi;
  if (target === "inboundStation") return InboundStationAbi;
  return EgressStationAbi;
}

/** Build calldata + relayer-chosen feeZen (+ optional native value). */
export function encodeMetaTx(req: RelayRequest, feeZen: bigint): EncodedMetaTx {
  const call = metaTxContractCall(req, feeZen);
  const data = encodeFunctionData({
    abi: abiForTarget(call.target),
    functionName: call.functionName,
    args: call.args as never,
  });
  return { to: req.verifyingContract, data, feeZen, value: call.value };
}

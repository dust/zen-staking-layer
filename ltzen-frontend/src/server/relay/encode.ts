import { encodeFunctionData, type Address, type Hex } from "viem";
import StLighterAbi from "@/abi/StLighter.json";
import type { RelayRequest } from "@/relayer/types";

export interface EncodedMetaTx {
  to: Address;
  data: Hex;
  feeZen: bigint;
}

/** Build StLighter calldata + relayer-chosen feeZen for depositWithSigAndPermit / redeemWithSig. */
export function encodeMetaTx(req: RelayRequest, feeZen: bigint): EncodedMetaTx {
  const to = req.verifyingContract;

  if (req.kind === "redeemWithSig") {
    const data = encodeFunctionData({
      abi: StLighterAbi,
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
    });
    return { to, data, feeZen };
  }

  if (req.kind === "depositWithSigAndPermit") {
    if (!req.permit) throw new Error("depositWithSigAndPermit requires permit");
    const p = req.permit;
    const data = encodeFunctionData({
      abi: StLighterAbi,
      functionName: "depositWithSigAndPermit",
      args: [
        BigInt(req.amount),
        req.receiver,
        BigInt(req.maxFeeZen),
        feeZen,
        req.user,
        BigInt(req.deadline),
        req.signature,
        BigInt(p.deadline),
        p.v,
        p.r,
        p.s,
      ],
    });
    return { to, data, feeZen };
  }

  throw new Error(`unsupported relay kind: ${req.kind}`);
}

import { encodeFunctionData, type Address, type Hex } from "viem";
import StLighterAbi from "@/abi/StLighter.json";
import type { RelayRequest } from "@/relayer/types";

export interface EncodedMetaTx {
  to: Address;
  data: Hex;
  feeZen: bigint;
}

type MetaTxFunctionName = "depositWithSigAndPermit" | "redeemWithSig";

/** Args passed to StLighter meta-tx entrypoints (shared by encode + simulate). */
export function metaTxContractCall(
  req: RelayRequest,
  feeZen: bigint,
): { functionName: MetaTxFunctionName; args: readonly unknown[] } {
  if (req.kind === "redeemWithSig") {
    return {
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
    };
  }

  if (req.kind === "depositWithSigAndPermit") {
    if (!req.permit) throw new Error("depositWithSigAndPermit requires permit");
    const p = req.permit;
    return {
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
        BigInt(p.deadline),
        p.v,
        p.r,
        p.s,
      ],
    };
  }

  throw new Error(`unsupported relay kind: ${req.kind}`);
}

/** Build StLighter calldata + relayer-chosen feeZen for depositWithSigAndPermit / redeemWithSig. */
export function encodeMetaTx(req: RelayRequest, feeZen: bigint): EncodedMetaTx {
  const to = req.verifyingContract;
  const { functionName, args } = metaTxContractCall(req, feeZen);
  const data = encodeFunctionData({
    abi: StLighterAbi,
    functionName,
    args: args as never,
  });
  return { to, data, feeZen };
}

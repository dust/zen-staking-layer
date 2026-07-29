/**
 * Relayer abstraction (frontend-plan §2 config/relayer.ts + uiux §4.3 / §6.1 gasless).
 */

import type { Address, Hex } from "viem";

/** Which gasless action this meta-tx authorizes; lets a relayer route to the right entrypoint. */
export type RelayKind =
  | "depositWithSigAndPermit"
  | "depositWithSig"
  | "redeemWithSig"
  | "redeemAndCredit"
  | "withdrawToHorizen"
  | "bridgeToBase"
  | "egressWithdrawToHorizen"
  | "bridge";

/** ZEN EIP-2612 permit signature bundled with depositWithSigAndPermit. */
export interface ZenPermitPayload {
  deadline: number;
  v: number;
  r: Hex;
  s: Hex;
}

export interface RelayRequest {
  kind: RelayKind;
  chainId: number;
  /**
   * Contract to call:
   * - StLighter proxy for deposit/redeem
   * - EgressStation for redeemAndCredit / bridgeToBase
   * - Inbound/Egress Station withdraw* are Direct-only (not BFF)
   */
  verifyingContract: Address;
  user: Address;
  /**
   * Kind-dependent:
   * - deposit/redeem: ltZEN/ZEN receiver
   * - withdraw*: destination on Horizen
   * - redeemAndCredit: unused (set = Egress / user)
   * - bridgeToBase: Base B1 `dest`
   */
  receiver: Address;
  /** assets (deposit/withdraw/bridge) or shares (redeem / redeemAndCredit), decimal string. */
  amount: string;
  maxFeeZen: string;
  /**
   * Gasless fee recipient bound in EIP-712. Must match the address the user signed.
   * BFF validates this equals the rrelayer EOA.
   */
  relayer: Address;
  deadline: number;
  /** EIP-712 signature for the kind's primary type. */
  signature: Hex;
  /** Required for depositWithSigAndPermit. */
  permit?: ZenPermitPayload;
  /**
   * ZEN payer for depositWithSig / depositWithSigAndPermit.
   * Same-chain: user. Cross-chain stake: InboundStation.
   * Defaults to `user` when omitted (AndPermit path).
   */
  payer?: Address;
  /**
   * Native fee (wei string) for `bridgeToBase` — paid by relayer via msg.value.
   * Required when kind === bridgeToBase.
   */
  nativeValue?: string;
  /** LayerZero executor options for bridgeToBase (hex). */
  extraOptions?: Hex;
}

export type RelayStatus =
  | "submitting"
  | "relaying"
  | "confirmed"
  | "timeout"
  | "failed";

export interface RelayResult {
  status: RelayStatus;
  txHash?: Hex;
  feeZen?: string;
  error?: string;
}

export interface RelayHandle {
  id: string;
  subscribe(listener: (result: RelayResult) => void): () => void;
  current(): RelayResult;
}

export interface Relayer {
  readonly label: string;
  submit(req: RelayRequest): Promise<RelayHandle>;
}

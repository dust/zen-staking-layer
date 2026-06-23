/**
 * Relayer abstraction (frontend-plan §2 config/relayer.ts + uiux §4.3 / §6.1 gasless).
 *
 * A relayer accepts a user-signed meta-transaction and submits it on-chain on the user's behalf,
 * taking a fee (`feeZen ≤ maxFeeZen`) out of the deposit. UI/business hooks depend ONLY on this
 * interface — never on a concrete endpoint or wire protocol. Swapping relayers = change the
 * endpoint list (relayer.ts) + the one concrete impl, nothing else.
 *
 * The same shape serves all gasless flows: Horizen depositWithSig / redeemWithSig, Base bridge.
 * Status is a small state machine the UI tracks (uiux §4.3): submitting → relaying → confirmed,
 * or → timeout (with a "use a standard deposit" fallback).
 */

import type { Address, Hex } from "viem";

/** Which gasless action this meta-tx authorizes; lets a relayer route to the right entrypoint. */
export type RelayKind = "depositWithSig" | "redeemWithSig" | "bridge";

/**
 * A signed authorization to relay. `args` is the EIP-712-signed tuple (assets/shares, receiver,
 * maxFeeZen, user, deadline) plus context; the relayer chooses `feeZen ≤ maxFeeZen` and builds
 * the actual call. We do NOT include feeZen here — the relayer fills it (it isn't part of the
 * signed payload; see StLighter DEPOSIT_WITH_SIG_TYPEHASH).
 */
export interface RelayRequest {
  kind: RelayKind;
  chainId: number;
  /** Contract to call (StLighter proxy for deposit/redeem). */
  verifyingContract: Address;
  user: Address;
  receiver: Address;
  /** assets (deposit) or shares (redeem), as a decimal string to stay JSON-safe. */
  amount: string;
  maxFeeZen: string;
  deadline: number;
  signature: Hex;
}

export type RelayStatus =
  | "submitting" // POSTing the meta-tx to a relayer endpoint
  | "relaying" // accepted; relayer is broadcasting / waiting for inclusion
  | "confirmed" // mined
  | "timeout" // no response within the deadline — offer standard-deposit fallback
  | "failed"; // relayer rejected or the tx reverted

export interface RelayResult {
  status: RelayStatus;
  /** On-chain tx hash once the relayer broadcasts (for the explorer link). */
  txHash?: Hex;
  /** Actual fee the relayer charged (≤ maxFeeZen), decimal string. */
  feeZen?: string;
  error?: string;
}

export interface RelayHandle {
  id: string;
  /** Subscribe to status transitions; returns an unsubscribe fn. */
  subscribe(listener: (result: RelayResult) => void): () => void;
  /** Current snapshot. */
  current(): RelayResult;
}

export interface Relayer {
  /** Human label for the chosen endpoint (shown in UI / logs). */
  readonly label: string;
  /** Submit a signed meta-tx; resolves to a handle to track status. */
  submit(req: RelayRequest): Promise<RelayHandle>;
}

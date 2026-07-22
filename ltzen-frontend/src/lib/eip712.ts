/**
 * EIP-712 helpers for StLighter gasless flows (M2 — depositWithSigAndPermit).
 *
 * Deposit authorization uses StLighter's DEPOSIT_WITH_SIG_TYPEHASH; ZEN transfer uses the
 * token's EIP-2612 Permit domain. Domains are read from chain at signing time so they cannot
 * drift from deployed contracts.
 */

import { readContract, signTypedData } from "wagmi/actions";
import type { Config } from "wagmi";
import type { Address, Hex } from "viem";
import { hexToSignature } from "viem";
import { abis } from "@/config/contracts";

export const DEPOSIT_WITH_SIG_TYPES = {
  DepositWithSig: [
    { name: "assets", type: "uint256" },
    { name: "receiver", type: "address" },
    { name: "maxFeeZen", type: "uint256" },
    { name: "payer", type: "address" },
    { name: "user", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const ZEN_PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const REDEEM_WITH_SIG_TYPES = {
  RedeemWithSig: [
    { name: "shares", type: "uint256" },
    { name: "receiver", type: "address" },
    { name: "maxFeeZen", type: "uint256" },
    { name: "user", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

type StLighterDomain = readonly [
  string,
  string,
  string,
  bigint,
  Address,
  Hex,
  readonly bigint[],
];

/** Read StLighter EIP-712 domain + user nonce from the proxy. */
export async function readDepositSignContext(
  config: Config,
  chainId: number,
  stLighter: Address,
  user: Address,
): Promise<{
  domain: { name: string; version: string; chainId: number; verifyingContract: Address };
  nonce: bigint;
}> {
  const [raw, nonce] = await Promise.all([
    readContract(config, {
      chainId,
      address: stLighter,
      abi: abis.stLighter,
      functionName: "eip712Domain",
    }) as Promise<StLighterDomain>,
    readContract(config, {
      chainId,
      address: stLighter,
      abi: abis.stLighter,
      functionName: "nonces",
      args: [user],
    }) as Promise<bigint>,
  ]);
  const [, name, version, chainIdOnChain, verifyingContract] = raw;
  return {
    domain: { name, version, chainId: Number(chainIdOnChain), verifyingContract },
    nonce,
  };
}

/** Read ZEN (ERC20Permit) EIP-712 domain + owner nonce. */
export async function readZenPermitContext(
  config: Config,
  chainId: number,
  zen: Address,
  owner: Address,
): Promise<{
  domain: { name: string; version: string; chainId: number; verifyingContract: Address };
  nonce: bigint;
}> {
  const [raw, nonce] = await Promise.all([
    readContract(config, {
      chainId,
      address: zen,
      abi: abis.zen,
      functionName: "eip712Domain",
    }) as Promise<StLighterDomain>,
    readContract(config, {
      chainId,
      address: zen,
      abi: abis.zen,
      functionName: "nonces",
      args: [owner],
    }) as Promise<bigint>,
  ]);
  const [, name, version, chainIdOnChain, verifyingContract] = raw;
  return {
    domain: { name, version, chainId: Number(chainIdOnChain), verifyingContract },
    nonce,
  };
}

export interface DepositWithSigParams {
  assets: bigint;
  receiver: Address;
  maxFeeZen: bigint;
  /** ZEN source: user wallet (same-chain) or InboundStation (cross-chain credit). */
  payer: Address;
  user: Address;
  deadline: bigint;
}

export interface ZenPermitParams {
  owner: Address;
  spender: Address;
  value: bigint;
  deadline: bigint;
}

export interface ZenPermitSignature {
  deadline: number;
  v: number;
  r: Hex;
  s: Hex;
}

/** Sign StLighter DepositWithSig (EIP-712). */
export async function signDepositWithSig(
  config: Config,
  chainId: number,
  stLighter: Address,
  params: DepositWithSigParams,
): Promise<{ signature: Hex; nonce: bigint }> {
  const { domain, nonce } = await readDepositSignContext(config, chainId, stLighter, params.user);
  const signature = await signTypedData(config, {
    domain,
    types: DEPOSIT_WITH_SIG_TYPES,
    primaryType: "DepositWithSig",
    message: { ...params, nonce },
  });
  return { signature, nonce };
}

export interface RedeemWithSigParams {
  shares: bigint;
  receiver: Address;
  maxFeeZen: bigint;
  user: Address;
  deadline: bigint;
}

/**
 * Sign StLighter RedeemWithSig (EIP-712). Reuses the StLighter domain + nonce (same proxy as
 * deposit). Unlike deposit, redeem needs no ERC20 permit — the contract burns the user's ltZEN
 * shares directly (internal accounting, no token approval).
 */
export async function signRedeemWithSig(
  config: Config,
  chainId: number,
  stLighter: Address,
  params: RedeemWithSigParams,
): Promise<{ signature: Hex; nonce: bigint }> {
  const { domain, nonce } = await readDepositSignContext(config, chainId, stLighter, params.user);
  const signature = await signTypedData(config, {
    domain,
    types: REDEEM_WITH_SIG_TYPES,
    primaryType: "RedeemWithSig",
    message: { ...params, nonce },
  });
  return { signature, nonce };
}

/** Sign ZEN EIP-2612 Permit. */
export async function signZenPermit(
  config: Config,
  chainId: number,
  zen: Address,
  params: ZenPermitParams,
): Promise<ZenPermitSignature> {
  const { domain, nonce } = await readZenPermitContext(config, chainId, zen, params.owner);
  const signature = await signTypedData(config, {
    domain,
    types: ZEN_PERMIT_TYPES,
    primaryType: "Permit",
    message: { ...params, nonce },
  });
  const { v, r, s } = hexToSignature(signature);
  return { deadline: Number(params.deadline), v: Number(v), r, s };
}

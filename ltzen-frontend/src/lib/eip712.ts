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

export const CREDIT_FROM_COMPOSE_TYPES = {
  CreditFromCompose: [
    { name: "assets", type: "uint256" },
    { name: "owner", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const WITHDRAW_TO_HORIZEN_TYPES = {
  WithdrawToHorizen: [
    { name: "assets", type: "uint256" },
    { name: "to", type: "address" },
    { name: "owner", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const CREDIT_FROM_REDEEM_TYPES = {
  CreditFromRedeem: [
    { name: "assets", type: "uint256" },
    { name: "owner", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const BRIDGE_TO_BASE_TYPES = {
  BridgeToBase: [
    { name: "assets", type: "uint256" },
    { name: "dest", type: "address" },
    { name: "maxFeeZen", type: "uint256" },
    { name: "owner", type: "address" },
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

/** Read InboundStation EIP-712 domain + owner nonce (always Horizen verifyingContract). */
export async function readInboundStationSignContext(
  config: Config,
  chainId: number,
  inboundStation: Address,
  owner: Address,
): Promise<{
  domain: { name: string; version: string; chainId: number; verifyingContract: Address };
  nonce: bigint;
}> {
  const [raw, nonce] = await Promise.all([
    readContract(config, {
      chainId,
      address: inboundStation,
      abi: abis.inboundStation,
      functionName: "eip712Domain",
    }) as Promise<StLighterDomain>,
    readContract(config, {
      chainId,
      address: inboundStation,
      abi: abis.inboundStation,
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

export interface CreditFromComposeParams {
  assets: bigint;
  owner: Address;
  deadline: bigint;
}

/** Sign InboundStation CreditFromCompose (Horizen EIP-712 domain.chainId).
 * Wallet must be on Horizen when MetaMask signs — callers should `switchChain` first. */
export async function signCreditFromCompose(
  config: Config,
  chainId: number,
  inboundStation: Address,
  params: CreditFromComposeParams,
): Promise<{ signature: Hex; nonce: bigint }> {
  const { domain, nonce } = await readInboundStationSignContext(
    config,
    chainId,
    inboundStation,
    params.owner,
  );
  const signature = await signTypedData(config, {
    domain,
    types: CREDIT_FROM_COMPOSE_TYPES,
    primaryType: "CreditFromCompose",
    message: { ...params, nonce },
  });
  return { signature, nonce };
}

export interface WithdrawToHorizenParams {
  assets: bigint;
  to: Address;
  owner: Address;
  deadline: bigint;
}

/** Sign InboundStation WithdrawToHorizen (Horizen domain; switch wallet to Horizen first). */
export async function signWithdrawToHorizen(
  config: Config,
  chainId: number,
  inboundStation: Address,
  params: WithdrawToHorizenParams,
): Promise<{ signature: Hex; nonce: bigint }> {
  const { domain, nonce } = await readInboundStationSignContext(
    config,
    chainId,
    inboundStation,
    params.owner,
  );
  const signature = await signTypedData(config, {
    domain,
    types: WITHDRAW_TO_HORIZEN_TYPES,
    primaryType: "WithdrawToHorizen",
    message: { ...params, nonce },
  });
  return { signature, nonce };
}

/** Read EgressStation EIP-712 domain + owner nonce. */
export async function readEgressStationSignContext(
  config: Config,
  chainId: number,
  egressStation: Address,
  owner: Address,
): Promise<{
  domain: { name: string; version: string; chainId: number; verifyingContract: Address };
  nonce: bigint;
}> {
  const [raw, nonce] = await Promise.all([
    readContract(config, {
      chainId,
      address: egressStation,
      abi: abis.egressStation,
      functionName: "eip712Domain",
    }) as Promise<StLighterDomain>,
    readContract(config, {
      chainId,
      address: egressStation,
      abi: abis.egressStation,
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

export interface CreditFromRedeemParams {
  assets: bigint;
  owner: Address;
  deadline: bigint;
}

/** Sign EgressStation CreditFromRedeem (switch wallet to Horizen first). */
export async function signCreditFromRedeem(
  config: Config,
  chainId: number,
  egressStation: Address,
  params: CreditFromRedeemParams,
): Promise<{ signature: Hex; nonce: bigint }> {
  const { domain, nonce } = await readEgressStationSignContext(
    config,
    chainId,
    egressStation,
    params.owner,
  );
  const signature = await signTypedData(config, {
    domain,
    types: CREDIT_FROM_REDEEM_TYPES,
    primaryType: "CreditFromRedeem",
    message: { ...params, nonce },
  });
  return { signature, nonce };
}

export interface BridgeToBaseParams {
  assets: bigint;
  dest: Address;
  maxFeeZen: bigint;
  owner: Address;
  deadline: bigint;
}

/** Sign EgressStation BridgeToBase (switch wallet to Horizen first). */
export async function signBridgeToBase(
  config: Config,
  chainId: number,
  egressStation: Address,
  params: BridgeToBaseParams,
): Promise<{ signature: Hex; nonce: bigint }> {
  const { domain, nonce } = await readEgressStationSignContext(
    config,
    chainId,
    egressStation,
    params.owner,
  );
  const signature = await signTypedData(config, {
    domain,
    types: BRIDGE_TO_BASE_TYPES,
    primaryType: "BridgeToBase",
    message: { ...params, nonce },
  });
  return { signature, nonce };
}

/** Sign EgressStation WithdrawToHorizen (recoverable_hold escape; Horizen domain). */
export async function signEgressWithdrawToHorizen(
  config: Config,
  chainId: number,
  egressStation: Address,
  params: WithdrawToHorizenParams,
): Promise<{ signature: Hex; nonce: bigint }> {
  const { domain, nonce } = await readEgressStationSignContext(
    config,
    chainId,
    egressStation,
    params.owner,
  );
  const signature = await signTypedData(config, {
    domain,
    types: WITHDRAW_TO_HORIZEN_TYPES,
    primaryType: "WithdrawToHorizen",
    message: { ...params, nonce },
  });
  return { signature, nonce };
}

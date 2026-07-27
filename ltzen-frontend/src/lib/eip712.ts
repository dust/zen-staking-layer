/**
 * EIP-712 helpers for StLighter / station meta-tx flows.
 *
 * DepositWithSig (cross-chain credit stake) and RedeemWithSig use StLighter's domain.
 * Domains are read from chain at signing time so they cannot drift from deployed contracts.
 */

import { readContract, signTypedData } from "wagmi/actions";
import type { Config } from "wagmi";
import type { Address, Hex } from "viem";
import { abis } from "@/config/contracts";

export const DEPOSIT_WITH_SIG_TYPES = {
  DepositWithSig: [
    { name: "assets", type: "uint256" },
    { name: "receiver", type: "address" },
    { name: "maxFeeZen", type: "uint256" },
    { name: "payer", type: "address" },
    { name: "relayer", type: "address" },
    { name: "user", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const REDEEM_WITH_SIG_TYPES = {
  RedeemWithSig: [
    { name: "shares", type: "uint256" },
    { name: "receiver", type: "address" },
    { name: "maxFeeZen", type: "uint256" },
    { name: "relayer", type: "address" },
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

export const BRIDGE_TO_BASE_TYPES = {
  BridgeToBase: [
    { name: "assets", type: "uint256" },
    { name: "dest", type: "address" },
    { name: "maxFeeZen", type: "uint256" },
    { name: "relayer", type: "address" },
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

export interface DepositWithSigParams {
  assets: bigint;
  receiver: Address;
  maxFeeZen: bigint;
  /** ZEN source: user wallet (same-chain) or InboundStation (cross-chain credit). */
  payer: Address;
  /** Gasless fee recipient (bound in EIP-712; may differ from tx submitter). */
  relayer: Address;
  user: Address;
  deadline: bigint;
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
  /** Gasless fee recipient (bound in EIP-712). */
  relayer: Address;
  user: Address;
  deadline: bigint;
}

/**
 * Sign StLighter RedeemWithSig (EIP-712). Reuses the StLighter domain + nonce (same proxy as
 * deposit). The contract burns the user's ltZEN shares directly (no ERC20 approval).
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

/** Read InboundStation EIP-712 domain (always Horizen verifyingContract). */
export async function readInboundStationDomain(
  config: Config,
  chainId: number,
  inboundStation: Address,
): Promise<{
  domain: { name: string; version: string; chainId: number; verifyingContract: Address };
}> {
  const raw = (await readContract(config, {
    chainId,
    address: inboundStation,
    abi: abis.inboundStation,
    functionName: "eip712Domain",
  })) as StLighterDomain;
  const [, name, version, chainIdOnChain, verifyingContract] = raw;
  return {
    domain: { name, version, chainId: Number(chainIdOnChain), verifyingContract },
  };
}

/** Sequential nonce for WithdrawToHorizen (not used by CreditFromCompose). */
export async function readInboundStationSignContext(
  config: Config,
  chainId: number,
  inboundStation: Address,
  owner: Address,
): Promise<{
  domain: { name: string; version: string; chainId: number; verifyingContract: Address };
  nonce: bigint;
}> {
  const [{ domain }, nonce] = await Promise.all([
    readInboundStationDomain(config, chainId, inboundStation),
    readContract(config, {
      chainId,
      address: inboundStation,
      abi: abis.inboundStation,
      functionName: "nonces",
      args: [owner],
    }) as Promise<bigint>,
  ]);
  return { domain, nonce };
}

/** Generate a Permit2-style unordered nonce (random word + free low 8 bits preferred). */
export function generateUnorderedNonce(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  // Keep bitPos = nonce & 0xff in a mid range; full 256-bit is fine.
  return (n << 8n) | BigInt(Date.now() & 0xff);
}

export interface CreditFromComposeParams {
  assets: bigint;
  owner: Address;
  deadline: bigint;
  /** Optional unordered bitmap nonce; generated if omitted. */
  nonce?: bigint;
}

/** Sign InboundStation CreditFromCompose (Horizen EIP-712 domain.chainId).
 * Uses unordered bitmap nonce — independent of WithdrawToHorizen / StLighter nonces.
 * Wallet must be on Horizen when MetaMask signs — callers should `switchChain` first. */
export async function signCreditFromCompose(
  config: Config,
  chainId: number,
  inboundStation: Address,
  params: CreditFromComposeParams,
): Promise<{ signature: Hex; nonce: bigint }> {
  const { domain } = await readInboundStationDomain(config, chainId, inboundStation);
  const nonce = params.nonce ?? generateUnorderedNonce();
  const signature = await signTypedData(config, {
    domain,
    types: CREDIT_FROM_COMPOSE_TYPES,
    primaryType: "CreditFromCompose",
    message: {
      assets: params.assets,
      owner: params.owner,
      nonce,
      deadline: params.deadline,
    },
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

export interface BridgeToBaseParams {
  assets: bigint;
  dest: Address;
  maxFeeZen: bigint;
  /** Gasless fee recipient (bound in EIP-712). */
  relayer: Address;
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

import StLighterAbi from "@/abi/StLighter.json";
import LtZENAbi from "@/abi/LtZEN.json";
import { horizen, HUB_CHAIN_ID } from "@/config/chains";
import {
  DEPOSIT_WITH_SIG_TYPES,
  REDEEM_WITH_SIG_TYPES,
} from "@/lib/eip712";
import type { RelayRequest } from "@/relayer/types";
import {
  createPublicClient,
  http,
  isAddress,
  type Address,
  type Hex,
  verifyTypedData,
} from "viem";
import { ltZenAddress, stLighterAddress } from "./config";
import { metaTxContractCall } from "./encode";
import { relayLog } from "./log";
import { getRelayerAddress, getRrelayerClients } from "./rrelayer";

/** Matches StLighter.MAX_GAS_FEE_ZEN (10 ZEN). */
const MAX_GAS_FEE_ZEN = 10n * 10n ** 18n;

const SUPPORTED_KINDS = new Set<RelayRequest["kind"]>([
  "depositWithSigAndPermit",
  "redeemWithSig",
]);

type Eip712DomainTuple = readonly [
  Hex,
  string,
  string,
  bigint,
  Address,
  Hex,
  readonly bigint[],
];

function hubPublicClient() {
  const rpc =
    process.env.RRELAYER_PROVIDER_URL?.trim() ?? horizen.rpcUrls.default.http[0];
  return createPublicClient({
    chain: horizen,
    transport: http(rpc),
  });
}

function parsePositiveBigInt(label: string, value: string): bigint {
  let n: bigint;
  try {
    n = BigInt(value);
  } catch {
    throw new Error(`invalid ${label}`);
  }
  if (n <= 0n) throw new Error(`${label} must be positive`);
  return n;
}

function assertAddress(label: string, value: string): asserts value is Address {
  if (!isAddress(value)) throw new Error(`invalid ${label}`);
}

/** Sync request guards (chain, contract, shape). */
export function assertRequest(req: RelayRequest): void {
  if (req.chainId !== HUB_CHAIN_ID) {
    throw new Error(`unsupported chainId ${req.chainId}`);
  }
  const configured = stLighterAddress();
  if (configured && req.verifyingContract.toLowerCase() !== configured.toLowerCase()) {
    throw new Error("verifyingContract mismatch");
  }
  if (!SUPPORTED_KINDS.has(req.kind)) {
    throw new Error(`unsupported relay kind: ${req.kind}`);
  }
  if (!req.signature?.startsWith("0x") || req.signature.length < 132) {
    throw new Error("invalid signature");
  }

  assertAddress("user", req.user);
  assertAddress("receiver", req.receiver);
  assertAddress("verifyingContract", req.verifyingContract);

  parsePositiveBigInt("amount", req.amount);
  parsePositiveBigInt("maxFeeZen", req.maxFeeZen);

  if (!Number.isFinite(req.deadline) || req.deadline <= 0) {
    throw new Error("invalid deadline");
  }

  if (req.kind === "depositWithSigAndPermit") {
    const p = req.permit;
    if (!p) throw new Error("depositWithSigAndPermit requires permit");
    if (!Number.isFinite(p.deadline) || p.deadline <= 0) {
      throw new Error("invalid permit deadline");
    }
    if (!p.r?.startsWith("0x") || !p.s?.startsWith("0x")) {
      throw new Error("invalid permit signature");
    }
    if (p.v !== 27 && p.v !== 28) throw new Error("invalid permit v");
  }
}

async function readStLighterDomain(
  client: ReturnType<typeof hubPublicClient>,
  stLighter: Address,
) {
  const raw = (await client.readContract({
    address: stLighter,
    abi: StLighterAbi,
    functionName: "eip712Domain",
  })) as Eip712DomainTuple;
  const [, name, version, chainId, verifyingContract] = raw;
  return {
    name,
    version,
    chainId: Number(chainId),
    verifyingContract,
  };
}

function assertFeeLimits(feeZen: bigint, maxFeeZen: bigint, basis: bigint): void {
  if (feeZen > maxFeeZen) throw new Error("feeZen exceeds maxFeeZen");
  if (maxFeeZen > MAX_GAS_FEE_ZEN) throw new Error("maxFeeZen exceeds contract cap");
  if (feeZen > MAX_GAS_FEE_ZEN) throw new Error("feeZen exceeds contract cap");
  if (feeZen >= basis) throw new Error("feeZen must be less than operation amount");
}

async function verifyStLighterSignature(
  req: RelayRequest,
  client: ReturnType<typeof hubPublicClient>,
): Promise<void> {
  const domain = await readStLighterDomain(client, req.verifyingContract);
  const chainNonce = (await client.readContract({
    address: req.verifyingContract,
    abi: StLighterAbi,
    functionName: "nonces",
    args: [req.user],
  })) as bigint;

  const assetsOrShares = BigInt(req.amount);
  const maxFeeZen = BigInt(req.maxFeeZen);
  const deadline = BigInt(req.deadline);

  if (req.kind === "depositWithSigAndPermit") {
    const message = {
      assets: assetsOrShares,
      receiver: req.receiver,
      maxFeeZen,
      user: req.user,
      nonce: chainNonce,
      deadline,
    };
    const valid = await verifyTypedData({
      address: req.user,
      domain,
      types: DEPOSIT_WITH_SIG_TYPES,
      primaryType: "DepositWithSig",
      message,
      signature: req.signature,
    });
    if (!valid) throw new Error("invalid DepositWithSig signature");
    return;
  }

  const message = {
    shares: assetsOrShares,
    receiver: req.receiver,
    maxFeeZen,
    user: req.user,
    nonce: chainNonce,
    deadline,
  };
  const valid = await verifyTypedData({
    address: req.user,
    domain,
    types: REDEEM_WITH_SIG_TYPES,
    primaryType: "RedeemWithSig",
    message,
    signature: req.signature,
  });
  if (!valid) throw new Error("invalid RedeemWithSig signature");
}

async function assertChainState(
  req: RelayRequest,
  client: ReturnType<typeof hubPublicClient>,
  feeZen: bigint,
  basis: bigint,
): Promise<void> {
  const now = (await client.getBlock()).timestamp;
  if (BigInt(req.deadline) < now) throw new Error("signature deadline expired");

  assertFeeLimits(feeZen, BigInt(req.maxFeeZen), basis);

  if (req.kind === "depositWithSigAndPermit") {
    const paused = (await client.readContract({
      address: req.verifyingContract,
      abi: StLighterAbi,
      functionName: "paused",
    })) as boolean;
    if (paused) throw new Error("StLighter deposits are paused");
    return;
  }

  const ltZen = ltZenAddress();
  if (!ltZen) throw new Error("ltZEN address not configured");
  const balance = (await client.readContract({
    address: ltZen,
    abi: LtZENAbi,
    functionName: "balanceOf",
    args: [req.user],
  })) as bigint;
  if (balance < BigInt(req.amount)) throw new Error("insufficient ltZEN balance");
}

async function simulateMetaTx(
  req: RelayRequest,
  feeZen: bigint,
  relayerAddress: Address,
): Promise<void> {
  const { publicClient } = await getRrelayerClients();
  const { functionName, args } = metaTxContractCall(req, feeZen);
  try {
    await publicClient.simulateContract({
      address: req.verifyingContract,
      abi: StLighterAbi,
      functionName,
      args: args as never,
      account: relayerAddress,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "simulation failed";
    throw new Error(`simulation reverted: ${reason}`);
  }
}

/**
 * Full pre-broadcast validation: EIP-712, chain state, fee bounds, simulateContract.
 * Throws on failure — caller maps to HTTP 400.
 */
export async function validateRelayRequest(
  req: RelayRequest,
  feeZen: bigint,
  basis: bigint,
): Promise<void> {
  const client = hubPublicClient();
  relayLog("validate: verifyTypedData");
  await verifyStLighterSignature(req, client);
  relayLog("validate: chain state");
  await assertChainState(req, client, feeZen, basis);
  relayLog("validate: getRelayerAddress");
  const relayerAddress = await getRelayerAddress();
  relayLog("validate: simulateContract", { relayerAddress, function: req.kind });
  await simulateMetaTx(req, feeZen, relayerAddress);
  relayLog("validate: simulate ok");
}

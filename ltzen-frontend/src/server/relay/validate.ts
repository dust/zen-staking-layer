import StLighterAbi from "@/abi/StLighter.json";
import LtZENAbi from "@/abi/LtZEN.json";
import InboundStationAbi from "@/abi/InboundStation.json";
import EgressStationAbi from "@/abi/EgressStation.json";
import { horizen, HUB_CHAIN_ID } from "@/config/chains";
import {
  BRIDGE_TO_BASE_TYPES,
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
import {
  egressStationAddress,
  inboundStationAddress,
  ltZenAddress,
  stLighterAddress,
} from "./config";
import { metaTxContractCall } from "./encode";
import { relayLog } from "./log";
import { getRelayerAddress, getRrelayerClients } from "./rrelayer";

/** Matches StLighter.MAX_GAS_FEE_ZEN (10 ZEN). */
const MAX_GAS_FEE_ZEN = 10n * 10n ** 18n;

const SUPPORTED_KINDS = new Set<RelayRequest["kind"]>([
  "depositWithSigAndPermit",
  "depositWithSig",
  "redeemWithSig",
  "redeemAndCredit",
  "bridgeToBase",
]);

/** Station escape hatches — Direct only; BFF/rrelayer does not serve them. */
const DIRECT_ONLY_KINDS = new Set<RelayRequest["kind"]>([
  "withdrawToHorizen",
  "egressWithdrawToHorizen",
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

type AnyAbi =
  | typeof StLighterAbi
  | typeof InboundStationAbi
  | typeof EgressStationAbi;

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
  if (DIRECT_ONLY_KINDS.has(req.kind)) {
    throw new Error(
      `${req.kind} is not served by BFF/rrelayer — use Direct wallet submit for the escape hatch`,
    );
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
  assertAddress("relayer", req.relayer);

  parsePositiveBigInt("amount", req.amount);
  parsePositiveBigInt("maxFeeZen", req.maxFeeZen);

  if (!Number.isFinite(req.deadline) || req.deadline <= 0) {
    throw new Error("invalid deadline");
  }

  if (req.kind === "depositWithSigAndPermit") {
    const configured = stLighterAddress();
    if (configured && req.verifyingContract.toLowerCase() !== configured.toLowerCase()) {
      throw new Error("verifyingContract mismatch");
    }
    const p = req.permit;
    if (!p) throw new Error("depositWithSigAndPermit requires permit");
    if (!Number.isFinite(p.deadline) || p.deadline <= 0) {
      throw new Error("invalid permit deadline");
    }
    if (!p.r?.startsWith("0x") || !p.s?.startsWith("0x")) {
      throw new Error("invalid permit signature");
    }
    if (p.v !== 27 && p.v !== 28) throw new Error("invalid permit v");
    const payer = req.payer ?? req.user;
    assertAddress("payer", payer);
    if (payer.toLowerCase() !== req.user.toLowerCase()) {
      throw new Error("depositWithSigAndPermit requires payer == user");
    }
  }

  if (req.kind === "depositWithSig") {
    const configured = stLighterAddress();
    if (configured && req.verifyingContract.toLowerCase() !== configured.toLowerCase()) {
      throw new Error("verifyingContract mismatch");
    }
    if (!req.payer) throw new Error("depositWithSig requires payer");
    assertAddress("payer", req.payer);
  }

  if (req.kind === "redeemWithSig") {
    const configured = stLighterAddress();
    if (configured && req.verifyingContract.toLowerCase() !== configured.toLowerCase()) {
      throw new Error("verifyingContract mismatch");
    }
  }

  if (req.kind === "redeemAndCredit" || req.kind === "bridgeToBase") {
    const configured = egressStationAddress();
    if (configured && req.verifyingContract.toLowerCase() !== configured.toLowerCase()) {
      throw new Error("verifyingContract mismatch (EgressStation)");
    }
  }

  if (req.kind === "bridgeToBase") {
    parsePositiveBigInt("nativeValue", req.nativeValue ?? "0");
    if (req.extraOptions && !req.extraOptions.startsWith("0x")) {
      throw new Error("invalid extraOptions");
    }
  }
}

async function readEip712Domain(
  client: ReturnType<typeof hubPublicClient>,
  address: Address,
  abi: AnyAbi,
) {
  const raw = (await client.readContract({
    address,
    abi,
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

async function verifySignature(
  req: RelayRequest,
  client: ReturnType<typeof hubPublicClient>,
): Promise<void> {
  const assetsOrShares = BigInt(req.amount);
  const maxFeeZen = BigInt(req.maxFeeZen || "0");
  const deadline = BigInt(req.deadline);

  if (req.kind === "bridgeToBase") {
    const domain = await readEip712Domain(client, req.verifyingContract, EgressStationAbi);
    const chainNonce = (await client.readContract({
      address: req.verifyingContract,
      abi: EgressStationAbi,
      functionName: "nonces",
      args: [req.user],
    })) as bigint;
    const valid = await verifyTypedData({
      address: req.user,
      domain,
      types: BRIDGE_TO_BASE_TYPES,
      primaryType: "BridgeToBase",
      message: {
        assets: assetsOrShares,
        dest: req.receiver,
        maxFeeZen,
        relayer: req.relayer,
        owner: req.user,
        nonce: chainNonce,
        deadline,
      },
      signature: req.signature,
    });
    if (!valid) throw new Error("invalid BridgeToBase signature");
    return;
  }

  if (req.kind === "redeemAndCredit" || req.kind === "redeemWithSig") {
    const stLighter = stLighterAddress();
    if (!stLighter) throw new Error("StLighter address not configured");
    const domain = await readEip712Domain(client, stLighter, StLighterAbi);
    const chainNonce = (await client.readContract({
      address: stLighter,
      abi: StLighterAbi,
      functionName: "nonces",
      args: [req.user],
    })) as bigint;
    const receiver =
      req.kind === "redeemAndCredit" ? req.verifyingContract /* Egress */ : req.receiver;
    const valid = await verifyTypedData({
      address: req.user,
      domain,
      types: REDEEM_WITH_SIG_TYPES,
      primaryType: "RedeemWithSig",
      message: {
        shares: assetsOrShares,
        receiver,
        maxFeeZen,
        relayer: req.relayer,
        user: req.user,
        nonce: chainNonce,
        deadline,
      },
      signature: req.signature,
    });
    if (!valid) throw new Error("invalid RedeemWithSig signature");
    return;
  }

  const domain = await readEip712Domain(client, req.verifyingContract, StLighterAbi);
  const chainNonce = (await client.readContract({
    address: req.verifyingContract,
    abi: StLighterAbi,
    functionName: "nonces",
    args: [req.user],
  })) as bigint;

  if (req.kind === "depositWithSigAndPermit" || req.kind === "depositWithSig") {
    const payer =
      req.kind === "depositWithSig" ? req.payer! : (req.payer ?? req.user);
    const message = {
      assets: assetsOrShares,
      receiver: req.receiver,
      maxFeeZen,
      payer,
      relayer: req.relayer,
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

  throw new Error(`unsupported relay kind for signature: ${req.kind}`);
}

async function assertChainState(
  req: RelayRequest,
  client: ReturnType<typeof hubPublicClient>,
  feeZen: bigint,
  basis: bigint,
): Promise<void> {
  const now = (await client.getBlock()).timestamp;
  if (BigInt(req.deadline) < now) throw new Error("signature deadline expired");

  if (req.kind === "bridgeToBase") {
    assertFeeLimits(feeZen, BigInt(req.maxFeeZen), basis);
    const credited = (await client.readContract({
      address: req.verifyingContract,
      abi: EgressStationAbi,
      functionName: "credited",
      args: [req.user],
    })) as bigint;
    if (credited < BigInt(req.amount)) throw new Error("insufficient egress credit");
    return;
  }

  assertFeeLimits(feeZen, BigInt(req.maxFeeZen), basis);

  if (req.kind === "depositWithSigAndPermit" || req.kind === "depositWithSig") {
    const paused = (await client.readContract({
      address: req.verifyingContract,
      abi: StLighterAbi,
      functionName: "paused",
    })) as boolean;
    if (paused) throw new Error("StLighter deposits are paused");

    if (req.kind === "depositWithSig") {
      const payer = req.payer!;
      const station = inboundStationAddress();
      if (!station || payer.toLowerCase() !== station.toLowerCase()) {
        throw new Error("depositWithSig payer must be InboundStation");
      }
      const credited = (await client.readContract({
        address: station,
        abi: InboundStationAbi,
        functionName: "credited",
        args: [req.user],
      })) as bigint;
      if (credited < BigInt(req.amount)) {
        throw new Error("insufficient InboundStation credit");
      }
    }
    return;
  }

  // redeemWithSig / redeemAndCredit — check ltZEN balance
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
  const call = metaTxContractCall(req, feeZen);
  const abi = call.target === "stLighter" ? StLighterAbi : EgressStationAbi;
  try {
    await publicClient.simulateContract({
      address: req.verifyingContract,
      abi,
      functionName: call.functionName,
      args: call.args as never,
      account: relayerAddress,
      ...(call.value > 0n ? { value: call.value } : {}),
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
  await verifySignature(req, client);
  relayLog("validate: chain state");
  await assertChainState(req, client, feeZen, basis);
  relayLog("validate: getRelayerAddress");
  const relayerAddress = await getRelayerAddress();
  if (req.relayer.toLowerCase() !== relayerAddress.toLowerCase()) {
    throw new Error("relayer address mismatch (must equal rrelayer EOA)");
  }
  relayLog("validate: simulateContract", { relayerAddress, function: req.kind });
  await simulateMetaTx(req, feeZen, relayerAddress);
  relayLog("validate: simulate ok");
}

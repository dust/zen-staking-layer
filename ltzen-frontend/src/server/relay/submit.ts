import { createPublicClient, http } from "viem";
import StLighterAbi from "@/abi/StLighter.json";
import { horizen, HUB_CHAIN_ID } from "@/config/chains";
import type { RelayRequest } from "@/relayer/types";
import { rrelayerConfigured, relayerFeeBps, stLighterAddress } from "./config";
import { computeFeeZen } from "./fee";
import { encodeMetaTx } from "./encode";
import { createJob, patchJob } from "./jobs";
import { broadcastContractCall, waitForTx } from "./rrelayer";

function hubPublicClient() {
  return createPublicClient({
    chain: horizen,
    transport: http(horizen.rpcUrls.default.http[0]),
  });
}

async function feeBasisWei(req: RelayRequest): Promise<bigint> {
  if (req.kind === "depositWithSigAndPermit") {
    return BigInt(req.amount);
  }
  const client = hubPublicClient();
  return client.readContract({
    address: req.verifyingContract,
    abi: StLighterAbi,
    functionName: "previewRedeem",
    args: [BigInt(req.amount)],
  }) as Promise<bigint>;
}

function assertRequest(req: RelayRequest): void {
  if (req.chainId !== HUB_CHAIN_ID) {
    throw new Error(`unsupported chainId ${req.chainId}`);
  }
  const configured = stLighterAddress();
  if (configured && req.verifyingContract.toLowerCase() !== configured.toLowerCase()) {
    throw new Error("verifyingContract mismatch");
  }
  if (!req.signature?.startsWith("0x")) throw new Error("invalid signature");
}

/** Queue meta-tx broadcast; returns job id immediately. */
export async function queueRelay(req: RelayRequest): Promise<{ id: string; feeZen: string }> {
  if (!rrelayerConfigured()) {
    throw new Error(
      "rrelayer is not configured — set RRELAYER_SERVER_URL, RRELAYER_RELAYER_ID, and API key or basic auth",
    );
  }

  assertRequest(req);

  const maxFeeZen = BigInt(req.maxFeeZen);
  const basis = await feeBasisWei(req);
  const feeZen = computeFeeZen(maxFeeZen, basis, relayerFeeBps());
  const { to, data } = encodeMetaTx(req, feeZen);

  const id = crypto.randomUUID();
  createJob(id);
  patchJob(id, { feeZen: feeZen.toString() });

  void (async () => {
    try {
      patchJob(id, { status: "relaying" });
      const hash = await broadcastContractCall(to, data);
      patchJob(id, { txHash: hash });
      await waitForTx(hash);
      patchJob(id, { status: "confirmed" });
    } catch (err) {
      patchJob(id, {
        status: "failed",
        error: err instanceof Error ? err.message : "relay failed",
      });
    }
  })();

  return { id, feeZen: feeZen.toString() };
}

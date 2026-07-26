import { createPublicClient, http } from "viem";
import StLighterAbi from "@/abi/StLighter.json";
import { horizen } from "@/config/chains";
import type { RelayRequest } from "@/relayer/types";
import { rrelayerConfigured, relayerFeeBps } from "./config";
import { computeFeeZen } from "./fee";
import { encodeMetaTx } from "./encode";
import { createJob, patchJob } from "./jobs";
import { relayError, relayLog } from "./log";
import { broadcastContractCall, waitForRrelayerTx } from "./rrelayer";
import { assertRequest, validateRelayRequest } from "./validate";

function hubPublicClient() {
  const rpc =
    process.env.RRELAYER_PROVIDER_URL?.trim() ?? horizen.rpcUrls.default.http[0];
  return createPublicClient({
    chain: horizen,
    transport: http(rpc),
  });
}

async function feeBasisWei(req: RelayRequest): Promise<bigint> {
  if (
    req.kind === "depositWithSigAndPermit" ||
    req.kind === "depositWithSig" ||
    req.kind === "withdrawToHorizen" ||
    req.kind === "creditFromRedeem" ||
    req.kind === "bridgeToBase" ||
    req.kind === "egressWithdrawToHorizen"
  ) {
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

/** Queue meta-tx broadcast; returns job id immediately after validation passes. */
export async function queueRelay(req: RelayRequest): Promise<{ id: string; feeZen: string }> {
  if (!rrelayerConfigured()) {
    throw new Error(
      "rrelayer is not configured — set RRELAYER_SERVER_URL, RRELAYER_RELAYER_ID, and API key or basic auth",
    );
  }

  relayLog("queueRelay start", { kind: req.kind, user: req.user });

  assertRequest(req);
  relayLog("assertRequest ok");

  const basis = await feeBasisWei(req);
  const feeZen =
    req.kind === "creditFromRedeem" ||
    req.kind === "withdrawToHorizen" ||
    req.kind === "egressWithdrawToHorizen"
      ? 0n
      : computeFeeZen(BigInt(req.maxFeeZen || "0"), basis, relayerFeeBps());
  relayLog("fee computed", {
    basis: basis.toString(),
    feeZen: feeZen.toString(),
    maxFeeZen: req.maxFeeZen,
  });

  relayLog("validateRelayRequest start");
  await validateRelayRequest(req, feeZen, basis);
  relayLog("validateRelayRequest ok");

  const { to, data, value } = encodeMetaTx(req, feeZen);
  relayLog("encoded meta-tx", {
    to,
    dataLen: data.length,
    selector: data.slice(0, 10),
    value: value.toString(),
  });

  const id = crypto.randomUUID();
  createJob(id);
  patchJob(id, { feeZen: feeZen.toString() });

  void (async () => {
    try {
      patchJob(id, { status: "relaying" });
      relayLog("broadcast start", { id, to, value: value.toString() });
      const { rrelayerTxId, hash } = await broadcastContractCall(to, data, value);
      relayLog("broadcast sent", { id, rrelayerTxId, hash });
      patchJob(id, { txHash: hash, rrelayerTxId });
      relayLog("waitForRrelayerTx start", { id, rrelayerTxId, hash });
      const confirmedHash = await waitForRrelayerTx(rrelayerTxId, hash);
      relayLog("waitForRrelayerTx confirmed", { id, hash: confirmedHash });
      patchJob(id, { txHash: confirmedHash, status: "confirmed" });
    } catch (err) {
      relayError("broadcast failed", err, { id, to });
      patchJob(id, {
        status: "failed",
        error: err instanceof Error ? err.message : "relay failed",
      });
    }
  })();

  relayLog("queueRelay returning job id", { id, feeZen: feeZen.toString() });
  return { id, feeZen: feeZen.toString() };
}

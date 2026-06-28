import {
  createRelayerClient,
  TransactionSpeed,
  type RelayerClientConfig,
} from "rrelayer";
// RelayerClient is not re-exported from "rrelayer" — construct directly so providerUrl is set
// (createClient().getRelayerClient() hardcodes providerUrl: "TODO" in SDK v1.2.0).
import { RelayerClient } from "rrelayer/dist/clients/relayer";
import {
  createPublicClient,
  http,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { horizen } from "@/config/chains";
import { relayError, relayLog } from "./log";

export interface RrelayerClients {
  relayer: RelayerClient;
  publicClient: PublicClient;
  chain: Chain;
}

let cached: Promise<RrelayerClients> | undefined;

function providerUrl(): string {
  return (
    process.env.RRELAYER_PROVIDER_URL?.trim() ?? horizen.rpcUrls.default.http[0]
  );
}

export function getRrelayerClients(): Promise<RrelayerClients> {
  if (!cached) cached = initRrelayerClients();
  return cached;
}

function wrapRrelayerError(err: unknown): Error {
  if (err && typeof err === "object" && "response" in err) {
    const ax = err as { response?: { status?: number; data?: unknown }; message?: string };
    const body =
      typeof ax.response?.data === "string"
        ? ax.response.data
        : JSON.stringify(ax.response?.data ?? {});
    return new Error(
      `rrelayer API ${ax.response?.status ?? "?"}: ${body || ax.message || "request failed"}`,
    );
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function buildRelayerClient(
  serverUrl: string,
  relayerId: string,
  rpc: string,
): RelayerClient {
  const apiKey = process.env.RRELAYER_API_KEY?.trim();
  const username = process.env.RRELAYER_AUTH_USERNAME?.trim();
  const password = process.env.RRELAYER_AUTH_PASSWORD?.trim();

  if (apiKey) {
    return createRelayerClient({
      serverUrl,
      relayerId,
      apiKey,
      providerUrl: rpc,
      speed: TransactionSpeed.FAST,
    });
  }

  if (username && password) {
    const config: RelayerClientConfig = {
      serverUrl,
      providerUrl: rpc,
      relayerId,
      auth: { username, password },
      fallbackSpeed: TransactionSpeed.FAST,
    };
    return new RelayerClient(config);
  }

  throw new Error("set RRELAYER_API_KEY or RRELAYER_AUTH_USERNAME/PASSWORD");
}

async function initRrelayerClients(): Promise<RrelayerClients> {
  const serverUrl = process.env.RRELAYER_SERVER_URL?.trim();
  const relayerId = process.env.RRELAYER_RELAYER_ID?.trim();
  relayLog("initRrelayerClients", { serverUrl, relayerId });
  if (!serverUrl || !relayerId) {
    throw new Error("RRELAYER_SERVER_URL and RRELAYER_RELAYER_ID are required");
  }

  const rpc = providerUrl();
  const apiKey = process.env.RRELAYER_API_KEY?.trim();
  const username = process.env.RRELAYER_AUTH_USERNAME?.trim();
  relayLog("initRrelayerClients auth", {
    auth: apiKey ? "apiKey" : username ? "basic" : "none",
    rpc,
  });

  const relayer = buildRelayerClient(serverUrl, relayerId, rpc);
  const chain = (await relayer.getViemChain()) as Chain;
  const relayerAddress = await relayer.address();
  relayLog("initRrelayerClients ready", { relayerAddress, chainId: chain.id });

  const publicClient = createPublicClient({
    chain,
    transport: http(rpc),
  });

  return { relayer, publicClient, chain };
}

export async function getRelayerAddress(): Promise<Address> {
  const { relayer } = await getRrelayerClients();
  return relayer.address();
}

export interface BroadcastResult {
  rrelayerTxId: string;
  hash: Hex;
}

/** Submit via rrelayer REST API (not viem sendTransaction — avoids SDK providerUrl:"TODO" bug). */
export async function broadcastContractCall(to: Hex, data: Hex): Promise<BroadcastResult> {
  relayLog("broadcastContractCall: relayer.transaction.send", {
    to,
    dataLen: data.length,
    selector: data.slice(0, 10),
  });
  const started = Date.now();
  try {
    const { relayer } = await getRrelayerClients();
    const sent = await relayer.transaction.send({
      to,
      data,
      speed: TransactionSpeed.FAST,
    });
    relayLog("broadcastContractCall: rrelayer accepted", {
      rrelayerTxId: sent.id,
      hash: sent.hash,
      ms: Date.now() - started,
    });
    return { rrelayerTxId: sent.id, hash: sent.hash };
  } catch (err) {
    const wrapped = wrapRrelayerError(err);
    relayError("broadcastContractCall failed", wrapped, { to, ms: Date.now() - started });
    throw wrapped;
  }
}

/**
 * Wait for rrelayer to mine the tx (uses rrelayer status API — fails fast on FAILED/EXPIRED).
 * Falls back to on-chain receipt wait if rrelayer already mined but status lags.
 */
export async function waitForRrelayerTx(
  rrelayerTxId: string,
  hash: Hex,
): Promise<Hex> {
  const { relayer, publicClient } = await getRrelayerClients();
  relayLog("waitForRrelayerTx", { rrelayerTxId, hash });
  try {
    const receipt = await relayer.transaction.waitForTransactionReceiptById(rrelayerTxId);
    relayLog("waitForRrelayerTx: confirmed via rrelayer", {
      rrelayerTxId,
      hash: receipt.transactionHash,
    });
    return receipt.transactionHash;
  } catch (err) {
    relayError("waitForRrelayerTx: rrelayer status failed", err, { rrelayerTxId, hash });
    // Tx may have landed despite status API error — one on-chain check before giving up.
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt) {
        relayLog("waitForRrelayerTx: found on-chain despite rrelayer error", { hash });
        return hash;
      }
    } catch {
      /* not mined */
    }
    const msg = err instanceof Error ? err.message : "rrelayer transaction failed";
    throw new Error(
      `${msg} — if rrelayer logs show "gas tip cap 0", configure a CUSTOM gas provider (see docs/stLighter-rrelayer-setup.md §6)`,
    );
  }
}

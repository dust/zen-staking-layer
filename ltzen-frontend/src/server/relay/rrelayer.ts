import { createClient, createRelayerClient, TransactionSpeed } from "rrelayer";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { horizen } from "@/config/chains";

export interface RrelayerClients {
  walletClient: WalletClient;
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

async function initRrelayerClients(): Promise<RrelayerClients> {
  const serverUrl = process.env.RRELAYER_SERVER_URL?.trim();
  const relayerId = process.env.RRELAYER_RELAYER_ID?.trim();
  if (!serverUrl || !relayerId) {
    throw new Error("RRELAYER_SERVER_URL and RRELAYER_RELAYER_ID are required");
  }

  const apiKey = process.env.RRELAYER_API_KEY?.trim();
  const username = process.env.RRELAYER_AUTH_USERNAME?.trim();
  const password = process.env.RRELAYER_AUTH_PASSWORD?.trim();
  const rpc = providerUrl();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let relayer: any;

  if (apiKey) {
    relayer = createRelayerClient({
      serverUrl,
      relayerId,
      apiKey,
      providerUrl: rpc,
      speed: TransactionSpeed.FAST,
    });
  } else if (username && password) {
    const client = createClient({
      serverUrl,
      auth: { username, password },
    });
    relayer = await client.getRelayerClient(relayerId, TransactionSpeed.FAST);
  } else {
    throw new Error("set RRELAYER_API_KEY or RRELAYER_AUTH_USERNAME/PASSWORD");
  }

  const chain = (await relayer.getViemChain()) as Chain;

  const walletClient = createWalletClient({
    account: await relayer.address(),
    chain,
    transport: custom(relayer.ethereumProvider()),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(rpc),
  });

  return { walletClient, publicClient, chain };
}

export async function broadcastContractCall(to: Hex, data: Hex): Promise<Hex> {
  const { walletClient } = await getRrelayerClients();
  return walletClient.sendTransaction({
    account: walletClient.account!,
    chain: walletClient.chain,
    to,
    data,
  });
}

export async function waitForTx(hash: Hex): Promise<void> {
  const { publicClient } = await getRrelayerClients();
  await publicClient.waitForTransactionReceipt({ hash });
}

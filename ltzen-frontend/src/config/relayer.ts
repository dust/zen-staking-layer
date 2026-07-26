/**
 * Abstract relayer endpoint configuration (frontend-plan §2 config/relayer.ts).
 *
 * gasless flows (Horizen deposit/redeem, Base bridge) submit a signed metaTx to ONE of
 * these candidate endpoints. The concrete protocol lives in `src/relayer/httpRelayer.ts`;
 * UI and business hooks never depend on a specific endpoint. Swapping relayers = change
 * this list + that one impl file.
 */

export const relayerEndpoints: string[] = (
  process.env.NEXT_PUBLIC_RELAYER_ENDPOINTS ?? ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Use same-origin Next.js BFF (`/api/relay`) — rrelayer credentials stay server-side. */
export const useRelayerBff = process.env.NEXT_PUBLIC_USE_RELAYER_BFF === "1";

export const bffEndpoint = "/api";

export const hasRelayer = relayerEndpoints.length > 0 || useRelayerBff;

/** Pure UI simulation — no on-chain broadcast (timeout testing via NEXT_PUBLIC_MOCK_RELAYER_TIMEOUT). */
export const useMockRelayerOnly = process.env.NEXT_PUBLIC_MOCK_RELAYER_ONLY === "1";

/**
 * Fee recipient bound into gasless EIP-712 (`relayer`).
 * BFF/rrelayer: must equal the rrelayer EOA (`NEXT_PUBLIC_RELAYER_FEE_ADDRESS`).
 * Direct submit: pass the connected wallet (receives feeZen, usually 0 on testnet).
 */
export function resolveGaslessFeeRelayer(connectedWallet: `0x${string}`): `0x${string}` {
  if (useRelayerBff || hasRelayer) {
    const configured = process.env.NEXT_PUBLIC_RELAYER_FEE_ADDRESS?.trim();
    if (configured && /^0x[a-fA-F0-9]{40}$/.test(configured)) {
      return configured as `0x${string}`;
    }
    if (useRelayerBff) {
      throw new Error(
        "NEXT_PUBLIC_RELAYER_FEE_ADDRESS is required when NEXT_PUBLIC_USE_RELAYER_BFF=1",
      );
    }
  }
  return connectedWallet;
}

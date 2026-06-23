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

export const hasRelayer = relayerEndpoints.length > 0;

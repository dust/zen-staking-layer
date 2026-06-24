import { base, horizen } from "@/config/chains";

/**
 * Block-explorer URL builders (uiux-spec §7: every transparency metric/address links out so
 * users can verify on-chain independently). Centralizes the per-chain explorer base + path
 * shapes that were previously inlined in StakeForm/RedeemForm/useTxLifecycle.
 *
 * Returns `undefined` when the chain has no explorer configured, so callers render a plain
 * value instead of a dead link.
 */

const CHAINS = { [horizen.id]: horizen, [base.id]: base } as const;

function explorerBase(chainId: number): string | undefined {
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  const url = chain?.blockExplorers?.default?.url;
  return url ? url.replace(/\/$/, "") : undefined;
}

/** Explorer link for a transaction hash on `chainId` (defaults to the Horizen hub). */
export function txUrl(hash: string, chainId: number = horizen.id): string | undefined {
  const root = explorerBase(chainId);
  return root ? `${root}/tx/${hash}` : undefined;
}

/** Explorer link for an address on `chainId` (defaults to the Horizen hub). */
export function addressUrl(address: string, chainId: number = horizen.id): string | undefined {
  const root = explorerBase(chainId);
  return root ? `${root}/address/${address}` : undefined;
}

/** Shorten an address for display, e.g. `0x1234… abcd`. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

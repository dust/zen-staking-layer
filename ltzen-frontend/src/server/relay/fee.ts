/** Compute relayer fee in ZEN wei (≤ maxFeeZen). */

export function computeFeeZen(maxFeeZen: bigint, basisWei: bigint, feeBps: bigint): bigint {
  if (maxFeeZen === 0n || basisWei === 0n) return 0n;
  const fee = (basisWei * feeBps) / 10_000n;
  return fee < maxFeeZen ? fee : maxFeeZen;
}

/** LayerZero OFT shared-decimal dust (local 18, shared 6 → rate 1e12 on ZEN). */

export const DEFAULT_OFT_DECIMAL_CONVERSION_RATE = 10n ** 12n;

/** Amount that can cross the OFT (drops sub–shared-decimal wei). */
export function truncateOftAmountLD(
  amountLD: bigint,
  decimalConversionRate: bigint = DEFAULT_OFT_DECIMAL_CONVERSION_RATE,
): bigint {
  if (decimalConversionRate <= 0n) return amountLD;
  return amountLD - (amountLD % decimalConversionRate);
}

/** Sub–shared-decimal remainder (stays on source chain when bridge truncates). */
export function oftAmountDust(
  amountLD: bigint,
  decimalConversionRate: bigint = DEFAULT_OFT_DECIMAL_CONVERSION_RATE,
): bigint {
  if (decimalConversionRate <= 0n) return 0n;
  return amountLD % decimalConversionRate;
}

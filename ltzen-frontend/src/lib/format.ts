import { formatUnits } from "viem";

/**
 * Number formatting for the ltZEN UI (uiux-spec §8.3, tone-guide §4).
 *
 * Rules:
 *   - Exchange rate (HeroRate):     6–8 decimals      → `1.0423100`
 *   - ZEN amounts / value / TVL:    2–4 decimals      → `1,250.80 ZEN`
 *   - Raw shares (ltZEN):           integer, thousands → `1,200,000 ltZEN`
 *   - Thousand separators on all large numbers; symbol after a single space.
 *   - `≈` prefix ONLY on estimates/previews, NEVER on real balances (caller decides).
 */

const ZEN_DECIMALS = 18;
const LTZEN_DECIMALS = 18;

function group(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format a bigint (wei-scale, 18 decimals) to a fixed number of decimal places with
 * thousand separators. Truncates (floors) extra decimals — never rounds value up, so we
 * don't overstate a balance.
 */
function formatFixed(value: bigint, tokenDecimals: number, displayDecimals: number): string {
  const s = formatUnits(value, tokenDecimals); // e.g. "1250.8035..."
  const [intPart, fracPart = ""] = s.split(".");
  const frac = fracPart.slice(0, displayDecimals).padEnd(displayDecimals, "0");
  const grouped = group(intPart);
  return displayDecimals > 0 ? `${grouped}.${frac}` : grouped;
}

/** Exchange rate `convertToAssets(1e18)` → 6–8 decimals. Default 7 to keep the live rise visible. */
export function formatRate(rateWei: bigint, decimals = 7): string {
  return formatFixed(rateWei, ZEN_DECIMALS, decimals);
}

/** ZEN amount / value / TVL → 2–4 decimals + thousands. Returns just the number (no symbol). */
export function formatZen(amountWei: bigint, decimals = 4): string {
  return formatFixed(amountWei, ZEN_DECIMALS, decimals);
}

/** ZEN amount with the unit suffix, e.g. `1,250.8000 ZEN`. */
export function formatZenAmount(amountWei: bigint, decimals = 4): string {
  return `${formatZen(amountWei, decimals)} ZEN`;
}

/** Raw ltZEN shares → integer with thousand separators + unit, e.g. `1,200,000 ltZEN`. */
export function formatShares(sharesWei: bigint): string {
  return `${formatFixed(sharesWei, LTZEN_DECIMALS, 0)} ltZEN`;
}

/** Estimate prefix per tone §4 — use for previews/derived values, never real balances. */
export function approx(text: string): string {
  return `≈ ${text}`;
}

/** Percentage with 1 decimal (uiux §8.3), e.g. `6.8%`. */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Multiply a token amount (wei) by an exchange rate (wei, where 1e18 == 1.0) and return
 * the resulting ZEN value in wei. Used for ltZEN balance → ZEN value (usePosition).
 */
export function applyRate(amountWei: bigint, rateWei: bigint): bigint {
  return (amountWei * rateWei) / 10n ** 18n;
}

/** Short relative time for "Last Harvest" etc. (e.g. "3h ago"); `null` → em dash. */
export function timeAgo(timestampSec: number | null | undefined): string {
  if (!timestampSec) return "—";
  const diff = Math.floor(Date.now() / 1000) - timestampSec;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Display tuning that doesn't affect on-chain reads — only how numbers are presented.
 */

/**
 * HeroRate display unit (frontend-plan §M1; addresses the DECIMALS_OFFSET=3 optics).
 *
 * The vault uses an ERC4626 decimals offset of 3, so `convertToAssets(1e18)` starts near
 * 0.001 ZEN per 1 ltZEN — the live per-block movement is hard to see at that magnitude. We
 * instead quote the value of N ltZEN (default 1000 = 10^DECIMALS_OFFSET) so the headline sits
 * near 1.0 and the trailing digits move visibly.
 *
 * IMPORTANT: this changes the QUANTITY shown, not the rate. The label must always state the
 * unit honestly ("1,000 ltZEN = X ZEN"), never "1 ltZEN = X" with a scaled number (tone-guide:
 * don't mislead). Configurable via NEXT_PUBLIC_HERO_RATE_UNITS.
 */
const parsed = Number(process.env.NEXT_PUBLIC_HERO_RATE_UNITS ?? "1000");

export const HERO_RATE_UNITS =
  Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1000;

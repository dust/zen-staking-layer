/**
 * Primary navigation entries, shared by the desktop Header and the mobile BottomTabBar
 * (uiux §2.1 / §9). One source of truth so the two stay in sync.
 *
 * Wave A: `/stake-crosschain` (From Base). Wave B: `/redeem-to-base` (To Base).
 * M5 ltZEN OFT `/bridge` remains a placeholder.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/stake", label: "Stake" },
  { href: "/redeem", label: "Redeem" },
  { href: "/stake-crosschain", label: "From Base" },
  { href: "/redeem-to-base", label: "To Base" },
  { href: "/transparency", label: "Transparency" },
] as const;

/**
 * Active-route check shared by HeaderNav + BottomTabBar.
 *
 * Do NOT use bare `pathname.startsWith(href)` — `/stake-crosschain` would light up
 * both Stake and From Base, and `/redeem-to-base` both Redeem and To Base.
 * Exact match, or a true nested path under `href/` (e.g. `/stake/foo`).
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

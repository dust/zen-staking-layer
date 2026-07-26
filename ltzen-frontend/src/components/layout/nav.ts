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

/**
 * Primary navigation entries, shared by the desktop Header and the mobile BottomTabBar
 * (uiux §2.1 / §9). One source of truth so the two stay in sync.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/stake", label: "Stake" },
  { href: "/redeem", label: "Redeem" },
  { href: "/bridge", label: "Bridge" },
  { href: "/transparency", label: "Transparency" },
] as const;

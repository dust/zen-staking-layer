"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav";

/**
 * BottomTabBar (uiux §9) — mobile-only (<md) bottom navigation. Fixed, safe-area aware, with
 * ≥44px touch targets. Active state is conveyed by both weight + an indicator bar (not color
 * alone, a11y §10). Hidden on desktop where the Header nav takes over.
 */

// Short glyphs keep the five tabs legible on narrow screens; labels stay full-word for a11y.
const ICONS: Record<string, string> = {
  "/": "◎",
  "/stake": "↧",
  "/redeem": "↥",
  "/bridge": "⇄",
  "/transparency": "◫",
};

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/80 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                  active ? "font-semibold text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                <span aria-hidden className="text-base leading-none">
                  {ICONS[item.href] ?? "•"}
                </span>
                <span className="leading-none">{item.label}</span>
                <span
                  aria-hidden
                  className={`mt-0.5 h-0.5 w-5 rounded-full ${active ? "bg-emerald-400" : "bg-transparent"}`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

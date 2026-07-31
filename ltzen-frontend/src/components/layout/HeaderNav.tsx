"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavActive } from "./nav";

/**
 * Desktop primary nav (≥md). Active tab uses weight + brand underline (not color alone),
 * matching BottomTabBar / a11y §10.
 */
export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
      {NAV_ITEMS.map((item) => {
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
              active
                ? "font-semibold text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {item.label}
            <span
              aria-hidden
              className={`absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full transition-colors ${
                active ? "bg-brand-green" : "bg-transparent"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}

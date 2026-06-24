import Link from "next/link";
import { ChainSwitcher } from "./ChainSwitcher";
import { WalletButton } from "./WalletButton";
import { TxBadge } from "./TxBadge";
import { NAV_ITEMS } from "./nav";

/**
 * Top bar (uiux §2.1): logo + primary nav + ChainSwitcher + WalletButton.
 * Server component shell; the interactive children are client components. The full nav shows on
 * desktop (≥md); on mobile the BottomTabBar takes over (uiux §9).
 */
export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-black/60 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-white">
          <span className="inline-block h-5 w-5 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400" />
          ltZEN
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <TxBadge />
          <ChainSwitcher />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

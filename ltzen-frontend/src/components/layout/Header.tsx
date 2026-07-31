import Link from "next/link";
import Image from "next/image";
import { ChainSwitcher } from "./ChainSwitcher";
import { WalletButton } from "./WalletButton";
import { TxBadge } from "./TxBadge";
import { HeaderNav } from "./HeaderNav";

/**
 * Top bar (uiux §2.1): logo + primary nav + ChainSwitcher + WalletButton.
 * Server component shell; the interactive children are client components. The full nav shows on
 * desktop (≥md); on mobile the BottomTabBar takes over (uiux §9). Brand: family logo.svg +
 * Syne wordmark, hairline + blur to match sibling project lighter-ui.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.10] bg-[#070A0E]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <Image src="/brand/logo.svg" alt="" width={22} height={22} className="shrink-0" priority />
          <span className="font-display text-base font-bold tracking-tight text-white">
            ltZEN
          </span>
        </Link>

        <HeaderNav />

        <div className="ml-auto flex items-center gap-3">
          <TxBadge />
          <ChainSwitcher />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

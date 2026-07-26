import Link from "next/link";

/**
 * Site footer (family style, mirrors sibling project lighter-ui AppFooter): hairline top border,
 * canvas fill, muted mono brand + a compact link row. Adds the legal `/terms` entry point plus a
 * one-line non-custodial / no-guarantee disclaimer aligned with the Horizen Foundation's ZEN
 * Staking Terms.
 *
 * On mobile the fixed BottomTabBar overlays the bottom ~56px, so the footer reserves extra bottom
 * padding (+ safe-area inset) to stay clear of it; on desktop (≥md) that padding collapses.
 */

const INTERNAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/transparency", label: "Transparency" },
] as const;

const EXTERNAL_LINKS = [
  { href: "https://horizen.io/staking-terms", label: "Horizen Staking Terms" },
] as const;

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="mt-auto border-t border-white/[0.10] bg-[#070A0E] px-4 pt-6 pb-24 md:pb-6"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] tracking-wide text-white/30 select-none">
            © {year} ltZEN · Liquid staking for ZEN
          </span>
          <span className="max-w-xl text-[11px] leading-relaxed text-white/25">
            Non-custodial software. Rewards are not guaranteed and carry no expectation of profit.
            Do not stake more than you can afford to lose.
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-1 gap-y-1" aria-label="Footer">
          {INTERNAL_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-md px-2.5 py-1 text-[11px] font-medium text-white/40 transition hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
            >
              {label}
            </Link>
          ))}
          {EXTERNAL_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-2.5 py-1 text-[11px] font-medium text-white/40 transition hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
            >
              {label} ↗
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

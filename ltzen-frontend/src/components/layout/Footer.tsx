import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Site footer (family style, mirrors sibling project lighter-ui AppFooter): hairline top border,
 * canvas fill, muted mono brand + a compact link row. Adds the legal `/terms` entry point plus a
 * one-line non-custodial / no-guarantee disclaimer aligned with the Horizen Foundation's ZEN
 * Staking Terms. Social icons mirror lighter-ui (X / GitHub / Telegram).
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

const SOCIAL_LINKS: ReadonlyArray<{
  href: string;
  label: string;
  title: string;
  icon: ReactNode;
}> = [
  {
    href: "https://x.com/lighterim",
    label: "X",
    title: "@lighterim on X",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.745l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    href: "https://github.com/lighterim/zenstaker-staking-layer",
    label: "GitHub",
    title: "zenstaker-staking-layer on GitHub",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.745 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    ),
  },
  {
    href: "https://t.me/+zSVLx3D9psI3YzVl",
    label: "Telegram",
    title: "Lighter.IM on Telegram",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    ),
  },
];

const linkClass =
  "rounded-md px-2.5 py-1 text-[11px] font-medium text-white/40 transition hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green";

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

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <nav className="flex flex-wrap items-center gap-x-1 gap-y-1" aria-label="Social links">
            {SOCIAL_LINKS.map(({ href, label, title, icon }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={title}
                className={`flex items-center gap-1.5 ${linkClass}`}
              >
                {icon}
                <span>{label}</span>
              </a>
            ))}
          </nav>

          <nav className="flex flex-wrap items-center gap-x-1 gap-y-1" aria-label="Footer">
            {INTERNAL_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className={linkClass}>
                {label}
              </Link>
            ))}
            {EXTERNAL_LINKS.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                {label} ↗
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}

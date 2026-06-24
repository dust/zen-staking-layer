/**
 * Reusable className tokens (design-uplift). Keeps brand surface/border/CTA/typography idioms
 * in one place so components reference a constant instead of repeating Tailwind arbitrary-value
 * strings. Pure presentation — no data or behavior. Brand DNA mirrors sibling project lighter-ui.
 */

/** Card / panel surface: brand surface fill + hairline border + rounded corners. */
export const SURFACE = "rounded-2xl border border-white/[0.06] bg-[#0D1117]";

/** Subtler inset surface (e.g. fee rows, input wells). */
export const SURFACE_INSET = "rounded-xl border border-white/[0.06] bg-white/[0.02]";

/** Hairline border color used across dividers and outlines. */
export const HAIRLINE = "border-white/[0.06]";

/** Brand gradient as a text fill (clip) — for the wordmark and HeroRate accents. */
export const BRAND_GRADIENT_TEXT =
  "bg-gradient-to-br from-brand-teal via-brand-green to-brand-indigo bg-clip-text text-transparent";

/** Brand gradient as a background fill — for the primary CTA and the logo swatch. */
export const BRAND_GRADIENT_BG =
  "bg-gradient-to-br from-brand-teal via-brand-green to-brand-indigo";

/** Primary CTA: brand gradient fill, dark text, subtle hover lift. */
export const CTA_PRIMARY =
  "inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-teal via-brand-green to-brand-indigo px-4 py-2.5 text-sm font-semibold text-black transition-[filter,opacity] hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green";

/** Ghost button: hairline outline, brightens on hover. */
export const BTN_GHOST =
  "inline-flex items-center justify-center rounded-xl border border-white/[0.12] px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green";

/** Display heading (Syne). */
export const DISPLAY = "font-display font-semibold tracking-tight";

/** Focus ring shared by interactive non-button elements (links, toggles). */
export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green";

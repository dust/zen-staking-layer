/**
 * Reusable className tokens (design-uplift). Keeps brand surface/border/CTA/typography idioms
 * in one place so components reference a constant instead of repeating Tailwind arbitrary-value
 * strings. Pure presentation — no data or behavior. Brand DNA mirrors sibling project lighter-ui.
 */

/** Card / panel surface: brand surface fill + visible hairline + soft lift for depth on the dark canvas. */
export const SURFACE =
  "rounded-2xl border border-white/[0.10] bg-[#0D1117] shadow-lg shadow-black/40";

/** Subtler inset surface (e.g. fee rows, input wells). */
export const SURFACE_INSET = "rounded-xl border border-white/[0.10] bg-white/[0.02]";

/** Hairline border color used across dividers and outlines. */
export const HAIRLINE = "border-white/[0.10]";

/**
 * Brand gradient as a text fill (clip) — DECORATIVE use only (logo, non-text accents). NOT for
 * text that must be read against the dark canvas: the indigo stop is too dark for legibility.
 */
export const BRAND_GRADIENT_TEXT =
  "bg-gradient-to-br from-brand-teal via-brand-green to-brand-indigo bg-clip-text text-transparent";

/** Brand gradient as a background fill — for the logo swatch / decorative panels. */
export const BRAND_GRADIENT_BG =
  "bg-gradient-to-br from-brand-teal via-brand-green to-brand-indigo";

/**
 * Primary CTA fill. Uses the TWO bright stops (teal→green) only — both are light mint, so the
 * black label keeps ~10:1 contrast across the whole button, including the `disabled:opacity-50`
 * state. The indigo stop is reserved for decorative gradients with no text on top.
 */
export const CTA_PRIMARY =
  "inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-teal to-brand-green px-4 py-2.5 text-sm font-semibold text-black transition-[filter,opacity] hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green";

/** Ghost button: hairline outline, brightens on hover. */
export const BTN_GHOST =
  "inline-flex items-center justify-center rounded-xl border border-white/[0.12] px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green";

/** Display heading (Syne). */
export const DISPLAY = "font-display font-semibold tracking-tight";

/** Focus ring shared by interactive non-button elements (links, toggles). */
export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green";

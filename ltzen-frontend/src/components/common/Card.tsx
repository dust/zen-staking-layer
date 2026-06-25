import { SURFACE } from "@/lib/theme";

/**
 * Card / panel surface (design-uplift D2). Default uses the shared SURFACE token (brand surface
 * fill + hairline border + rounded-2xl). `accent` wraps it in a subtle brand-gradient ring for
 * emphasis cards (used sparingly — restrained dashboard direction).
 */
export function Card({
  children,
  className = "",
  accent = false,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: boolean;
}) {
  if (accent) {
    return (
      <div className="bg-brand-full rounded-2xl p-px opacity-60">
        <div className={`rounded-2xl bg-[#0D1117] p-5 ${className}`}>{children}</div>
      </div>
    );
  }
  return <div className={`${SURFACE} p-5 ${className}`}>{children}</div>;
}

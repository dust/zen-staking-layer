export function Skeleton({ className = "" }: { className?: string }) {
  // Brand-cool shimmer; gated by motion-safe so reduced-motion users see a static block.
  return (
    <div
      className={`rounded-md bg-white/[0.06] motion-safe:animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}

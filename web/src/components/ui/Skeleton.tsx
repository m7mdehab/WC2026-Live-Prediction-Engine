import { cn } from "@/lib/utils";

/** A single placeholder block for route loading shells. Token-driven (bg-elevated) with a
 *  motion-safe shimmer (see .skeleton in globals.css); reduced-motion users get a still block.
 *  Pure markup, no data - cheap enough to paint instantly on navigation. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

/** Convenience: N stacked line placeholders (for paragraph/table-row shells). */
export function SkeletonLines({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-4" />
      ))}
    </div>
  );
}

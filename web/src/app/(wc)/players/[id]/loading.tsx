import { Skeleton } from "@/components/ui/Skeleton";

/** Matches /players/[id]: identity header, the role output + trajectory pair, then the match log.
 *  Motion-safe shimmer from the Skeleton primitive; reduced-motion users get still blocks. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Skeleton className="h-3 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

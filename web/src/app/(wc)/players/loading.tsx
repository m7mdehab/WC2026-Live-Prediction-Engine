import { Skeleton } from "@/components/ui/Skeleton";

/** Matches /players: title, the four award cards, then the filterable list. Motion-safe shimmer
 *  comes from the Skeleton primitive; reduced-motion users get still blocks. */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-prose" />
      </div>

      {/* award cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-full" />
        ))}
      </div>

      {/* index */}
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

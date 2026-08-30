import { Skeleton } from "@/components/ui/Skeleton";

/** Matches /groups (W5 Survival Map): a title, a 3-tile fate summary, then the 12-cluster field of
 *  four team cells each. Heights mirror the live surface (h-14 tiles, h-8 cells) to hold CLS at zero. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="mb-1 h-3 w-14" />
            {Array.from({ length: 4 }).map((_, r) => (
              <Skeleton key={r} className="h-8 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

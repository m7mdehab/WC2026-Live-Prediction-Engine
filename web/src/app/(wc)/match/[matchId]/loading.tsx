import { Skeleton } from "@/components/ui/Skeleton";

/** Matches /match/[matchId]: a breadcrumb, the two-team header with the score/odds in between,
 *  the outcome probability bars, then the detail panel. */
export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-32" />
      <div className="flex items-center justify-center gap-6">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-16 w-16 rounded-full" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

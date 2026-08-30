import { Skeleton } from "@/components/ui/Skeleton";

/** Matches /matches/day/[date]: the date title, the matchday briefing card, then that day's fixtures. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-32 w-full" />
      <div className="mt-2 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

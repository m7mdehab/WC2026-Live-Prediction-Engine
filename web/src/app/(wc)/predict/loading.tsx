import { Skeleton } from "@/components/ui/Skeleton";

/** Matches /predict: the AI-vs-humans comparison + leaderboard first, then the bracket picker. */
export default function Loading() {
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-40 w-full" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-7 w-56" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

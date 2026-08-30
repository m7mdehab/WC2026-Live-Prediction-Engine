import { Skeleton } from "@/components/ui/Skeleton";

/** Matches /forecast: the wide projected-bracket block first, then the champion-probability table. */
export default function Loading() {
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-72 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-7 w-64" />
        <div className="space-y-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

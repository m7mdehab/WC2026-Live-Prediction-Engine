import { Skeleton } from "@/components/ui/Skeleton";

/** Matches /matches: title + intro, the matchday calendar strip, then the fixture list. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-full max-w-2xl" />
      <Skeleton className="mt-2 h-24 w-full" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatchDetail } from "@/lib/data";
import { isSeasonFrozen } from "@/lib/data/freeze";
import { MatchView } from "@/components/match/MatchView";

// ISR + prebuilt (Track C static seal). generateStaticParams prebuilds every real match id WHEN the season
// is frozen (an immutable, finished dataset worth baking); a future LIVE season returns [] so nothing is
// prebuilt and dynamicParams renders each on demand - reversible via isFrozen, NO date. Match ids are the
// 104 fixtures M001..M104 (the schedule), a DB-free constant range, so the enumerator adds no build read.
export const revalidate = 3600;
export const dynamicParams = true;
export async function generateStaticParams(): Promise<{ matchId: string }[]> {
  if (!(await isSeasonFrozen())) return [];
  return Array.from({ length: 104 }, (_, i) => ({ matchId: `M${String(i + 1).padStart(3, "0")}` }));
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  let detail = null;
  try {
    detail = await getMatchDetail(matchId);
  } catch (err) {
    console.error("Failed to load match detail:", err);
  }
  if (!detail) notFound();

  // Real-fixture gate: only fixtures with a concrete pairing have a page (group now; knockouts as
  // they resolve). Projected knockout slots aren't linkable, but guard the direct URL too.
  if (!detail.fixture.team_a || !detail.fixture.team_b) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-xl font-bold text-fg">Match not set yet</h1>
        <p className="mt-2 max-w-prose text-sm text-secondary">
          This knockout slot resolves to a real fixture once results are entered. Until then, see the{" "}
          <Link href="/forecast#bracket" className="font-medium text-confident hover:underline">projected bracket</Link>.
        </p>
      </div>
    );
  }

  return <MatchView detail={detail} />;
}

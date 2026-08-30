import Link from "next/link";
import { SurvivalMap } from "@/components/groups/SurvivalMap";
import { BestThirdsTable } from "@/components/groups/BestThirdsTable";
import type { GroupsData } from "@/lib/data/groups";

function intro(status: GroupsData["status"]): string {
  if (status === "final") return "Final group standings.";
  if (status === "live") return "Live group standings, provisional until each group's three matchdays are complete.";
  return "Projected group standings: the model's most-likely finishing order with qualification odds.";
}

// The /groups standings surface is W5 direction A - the Survival Map: all 48 teams in one
// fate-coloured field instead of a stack of per-group standings cards. Order + qualification come
// from the real engine (getGroupsData -> buildGroupsData: FIFA Article 13 top-2 + best-thirds). The
// best-thirds table stays below, keeping the real best-8 detail the map's flat "contention" fate
// does not itemise.
export function GroupTables({ data }: { data: GroupsData }) {
  const { bestThirds, status, hasResults, groups } = data;

  return (
    <section>
      <h1 className="font-display text-2xl font-bold text-fg">Group Standings</h1>
      <p className="mb-4 max-w-3xl text-sm text-secondary">
        {intro(status)}{" "}
        <Link href="/methodology#forecast-reads" className="text-confident hover:underline">
          How standings are computed
        </Link>
      </p>

      {groups.length === 0 ? (
        <p className="text-sm text-secondary">No group data published yet.</p>
      ) : (
        <>
          <SurvivalMap data={data} />
          <BestThirdsTable thirds={bestThirds} hasResults={hasResults} />
        </>
      )}
    </section>
  );
}

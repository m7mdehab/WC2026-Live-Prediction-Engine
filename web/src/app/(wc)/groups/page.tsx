import { getGroupsData } from "@/lib/data/groups";
import { GroupTables } from "@/components/groups/GroupTables";
import type { GroupsData } from "@/lib/data/groups";

// ISR (Track C static seal). Oracles bounded (freeze.ts + version.ts) and getGroupsData is now cookie-free
// (publicClient), so /groups renders statically. Live freshness via RESULT_SURFACES revalidatePath + the
// version-keyed Data Cache; reversible via the isFrozen data TTL, no date.
export const revalidate = 3600;

const EMPTY: GroupsData = { groups: [], bestThirds: [], status: "projected", hasResults: false };

export default async function GroupsPage() {
  let data: GroupsData = EMPTY;
  try {
    data = await getGroupsData();
  } catch (err) {
    console.error("Failed to load group standings:", err);
  }
  return <GroupTables data={data} />;
}

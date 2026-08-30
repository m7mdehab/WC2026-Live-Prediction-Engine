import { getTeamsIndex } from "@/lib/data/teams";
import { TeamsIndexView } from "@/components/teams/TeamsIndexView";
import type { TeamsIndex } from "@/lib/types/teams";

// Public, RLS-protected reads; refresh periodically (the forecast changes when results → recalc).
export const revalidate = 300;

export default async function TeamsPage() {
  let data: TeamsIndex = { run: null, groups: [], demo: false };
  try {
    data = await getTeamsIndex();
  } catch (err) {
    console.error("Failed to load teams index:", err);
  }
  return <TeamsIndexView data={data} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPlayerProfile, getProjectionMeta } from "@/lib/data/players";
import { PlayerProfileView } from "@/components/players/PlayerProfileView";
import { PaceBand } from "@/components/dashboard/players/PaceBand";
import { buildPaceMetrics } from "@/components/dashboard/players/pace";
import type { ProjectionMeta } from "@/lib/types/players";

// ISR on-demand (Track C static seal). With the oracles bounded (freeze.ts + version.ts) this route no
// longer opts out of static rendering. It is rendered on the FIRST request per id then cached, NOT
// prebuilt: there are ~897 player pages and prebuilding all of them would be a large build-time read
// burst. dynamicParams defaults true, so any id renders on demand and unknown ids still 404 via
// notFound(). Freshness via revalidatePath("/players/[id]") on a player-stat write; reversible via the
// isFrozen data TTL, no date.
export const revalidate = 3600;

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const profile = await getPlayerProfile(id);
  if (!profile) return { title: "Player not found", alternates: { canonical: `/players/${id}` } };
  const { player } = profile;
  const role = player.role ?? "player";
  return {
    title: player.name,
    description: `${player.name} (${player.nation}${player.club ? `, ${player.club}` : ""}): projected vs actual output for the World Cup 2026, the model's ${role} metrics and per-match log.`,
    alternates: { canonical: `/players/${id}` },
  };
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getPlayerProfile(id);
  if (!profile) notFound();
  // Freshness stamp meta; fails soft to null (degrades to "latest available") without blocking render.
  const metaRes = await Promise.allSettled([getProjectionMeta()]);
  const meta: ProjectionMeta | null =
    metaRes[0].status === "fulfilled" ? metaRes[0].value : null;
  if (metaRes[0].status === "rejected") console.error("Failed to load projection meta:", metaRes[0].reason);
  // Pace band props resolved server-side (pure join over the already-fetched profile); an empty
  // metric set (actuals-only player) renders nothing, leaving the page header unchanged.
  const paceMetrics = buildPaceMetrics(profile);
  return (
    <>
      {paceMetrics.length > 0 ? (
        <div className="mx-auto mb-5 max-w-4xl">
          <PaceBand metrics={paceMetrics} matches={profile.matchStats.length} />
        </div>
      ) : null}
      <PlayerProfileView profile={profile} runId={profile.sourceRunId} meta={meta} />
    </>
  );
}

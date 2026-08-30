import type { Metadata } from "next";
import Link from "next/link";
import { getAwardRaces, getPlayersIndex, getPositionLeaders, getProjectionMeta } from "@/lib/data/players";
import { TOURNAMENT_END } from "@/lib/data/daily";
import { AwardCards } from "@/components/players/AwardCards";
import { PositionLeaders } from "@/components/players/PositionLeaders";
import { PlayersIndexView } from "@/components/players/PlayersIndexView";
import { PreTournamentExpectations } from "@/components/players/PreTournamentExpectations";
import { ProjectionStamp } from "@/components/players/ProjectionStamp";
import { StaleNote } from "@/components/players/StaleNote";
import { buildPreExpectations, LOCKED } from "@/lib/data/lockedProjections";
import { getPlayerEliminations } from "@/lib/data/playerEliminationData";
import type { EliminationFacts } from "@/lib/data/playerElimination";
import type { AwardRaces, PlayerIndexRow, PositionLeaders as PositionLeadersData, ProjectionMeta } from "@/lib/types/players";

export const metadata: Metadata = {
  title: "Players",
  description:
    "The model's award races (Golden Boot, Playmaker, Golden Glove, Player of the Tournament) and a filterable index of every tracked player, with projected vs actual output.",
  alternates: { canonical: "/players" },
};

// RESILIENCE: /players is ISR (was force-dynamic). Next serves the last SUCCESSFULLY generated render
// and regenerates in the background on a 60s window (matching the read-cache TTL) plus the write
// path's revalidatePath("/players") (api/admin/player-stats), so freshness on a real data change is
// preserved while a slow-Supabase window can no longer
// blank the page. The critical board read THROWS on error (below) so a failed regeneration is
// DISCARDED and the last-good board keeps being served - fail-soft means degraded, never blank.
// (The version-keyed data cache mints a fresh key every recalc, so pre-ISR the first post-recalc hit
// had to do a cold blocking read; a slow-Supabase window there is exactly what produced the blank.)
export const revalidate = 60;

export default async function PlayersPage() {
  // Stamp when this render was generated; the client StaleNote compares it to the reader's clock so a
  // genuinely old (stuck-regeneration) board is labelled honestly instead of silently posing as live.
  const generatedAt = new Date().toISOString();
  const [racesRes, indexRes, posRes, metaRes, elimRes] = await Promise.allSettled([
    getAwardRaces(), getPlayersIndex(), getPositionLeaders(), getProjectionMeta(), getPlayerEliminations(),
  ]);
  // CRITICAL board read. At RUNTIME, if the players index read ERRORED (not merely returned empty),
  // THROW so ISR discards this failed regeneration and keeps serving the last-good render (never
  // publishes a blank board). At BUILD there is no last-good to preserve, so throwing would only break
  // the build under a slow-Supabase window; instead render the honest empty state and let the first
  // successful post-deploy ISR revalidation backfill the real board. NEXT_PHASE distinguishes the two.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  if (indexRes.status === "rejected" && !isBuild) {
    console.error("Players index read failed; throwing to preserve the last-good ISR render:", indexRes.reason);
    throw indexRes.reason instanceof Error ? indexRes.reason : new Error("players index read failed");
  }
  if (indexRes.status === "rejected") console.error("Players index read failed at build; ISR will backfill:", indexRes.reason);
  const races: AwardRaces | null = racesRes.status === "fulfilled" ? racesRes.value : null;
  const rows: PlayerIndexRow[] = indexRes.status === "fulfilled" ? indexRes.value : [];
  const positionLeaders: PositionLeadersData | null = posRes.status === "fulfilled" ? posRes.value : null;
  const meta: ProjectionMeta | null = metaRes.status === "fulfilled" ? metaRes.value : null;
  // Elimination facts fail OPEN: a rejected read leaves the map empty, so every team stays live (a bad
  // read can only UN-freeze a "now", never wrongly freeze a live player).
  const eliminations: EliminationFacts = elimRes.status === "fulfilled" ? elimRes.value : new Map();
  if (racesRes.status === "rejected") console.error("Failed to load award races:", racesRes.reason);
  if (posRes.status === "rejected") console.error("Failed to load position leaders:", posRes.reason);
  if (metaRes.status === "rejected") console.error("Failed to load projection meta:", metaRes.reason);
  if (elimRes.status === "rejected") console.error("Failed to load player eliminations:", elimRes.reason);

  const hasAwards =
    !!races &&
    (races.goldenBoot.length || races.playmaker.length || races.goldenGlove.length || races.potm.length);
  const hasPositions =
    !!positionLeaders &&
    (positionLeaders.gk.length || positionLeaders.df.length ||
      positionLeaders.mf.length || positionLeaders.fw.length);

  // Frozen pre-tournament expectations vs the "now" projection: joined off the same index rows (no extra
  // read), keyed by StatsBomb id (fallback name+nation). An ELIMINATED player's "now" is FROZEN to his
  // as-played value (never re-projects, never rises); the marquee is ordered by the displayed now-value.
  const preExpectations = buildPreExpectations(rows, eliminations).slice(0, 24);

  // Settled framing (same deterministic date signal as the home / forecast): once the tournament has
  // ended, the actuals award boards show the FINAL standings + a pick-vs-actual verdict, not a live race.
  const settled = new Date().toISOString().slice(0, 10) > TOURNAMENT_END;

  return (
    <section>
      <h1 className="font-display text-2xl font-bold text-fg">Players</h1>
      <p className="mt-1 max-w-prose text-sm text-secondary">
        The model&apos;s award races and every tracked player, projected output against actuals.
      </p>

      {/* honest "cached board" note: appears only when the ISR-served render has aged past ~3min (a
          stuck-regeneration / slow-Supabase window). Silent while the board is fresh. */}
      <StaleNote generatedAt={generatedAt} />

      {/* honest as-of stamp: when the displayed generation was projected + what it is conditioned on */}
      {hasAwards || hasPositions ? <ProjectionStamp meta={meta} className="mt-3" /> : null}

      {/* award races - the model's current leaders, gold accent, honest framing */}
      <div className="mt-5">
        {hasAwards ? (
          <AwardCards races={races!} settled={settled} />
        ) : (
          <p className="text-sm text-muted">No award leaderboards published yet.</p>
        )}
      </div>

      {/* best at each position - A7 per-position boards */}
      {hasPositions ? (
        <div className="mt-8">
          <PositionLeaders leaders={positionLeaders!} />
        </div>
      ) : null}

      {/* frozen pre-tournament expectations vs the live re-projection (locked baseline + delta) */}
      {preExpectations.length > 0 ? (
        <div className="mt-8">
          <PreTournamentExpectations
            rows={preExpectations}
            asOf={LOCKED._meta.as_of}
            label={LOCKED._meta.label}
          />
        </div>
      ) : null}

      {/* filterable index - a client island over the server-fetched list */}
      <div className="mt-6">
        {rows.length === 0 ? (
          <p className="text-sm text-secondary">No tracked players published yet.</p>
        ) : (
          <PlayersIndexView rows={rows} />
        )}
      </div>

      {/* honest framing footer */}
      <p className="mt-4 max-w-prose text-xs leading-relaxed text-muted">
        How these projections are built:{" "}
        <Link href="/methodology#player-projections" className="text-confident hover:underline">
          methodology
        </Link>
        . Independent project, not affiliated with FIFA.
      </p>
    </section>
  );
}

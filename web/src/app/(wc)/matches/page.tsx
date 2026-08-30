import type { Metadata } from "next";
import {
  getMatchesData, getLiveScore, TOURNAMENT_END, TOURNAMENT_START,
  type DailyFixture, type DailyIndex, type LiveScore,
} from "@/lib/data/daily";
import { getProjectedBracket } from "@/lib/data";
import { matchdayCardState } from "@/components/daily/DailyCalendar";
import { MatchesSearch } from "@/components/matches/MatchesSearch";
import { DailyCalendar } from "@/components/daily/DailyCalendar";

export const metadata: Metadata = {
  title: "Matches",
  description:
    "Every World Cup 2026 fixture, group stage through the Final, with the model's live odds, recorded results, and a daily matchday briefing for each date.",
  alternates: { canonical: "/matches" },
};

// ISR (Track C static seal). Oracles bounded (freeze.ts + version.ts) and all reads are cookie-free, so
// /matches renders statically. Live freshness via RESULT_SURFACES revalidatePath + the version-keyed Data
// Cache; reversible via the isFrozen data TTL, no date.
export const revalidate = 3600;

export default async function MatchesPage() {
  // ONE fixtures read powers both halves of the page: the matchday calendar (next-matchday rule)
  // and the full-tournament fixture list (group + knockout).
  let fixtures: DailyFixture[] = [];
  let index: DailyIndex | null = null;
  try {
    const data = await getMatchesData();
    fixtures = data.fixtures;
    index = data.index;
  } catch (err) {
    console.error("Failed to load match list:", err);
  }

  // ONE server-side reference instant powers every "nearest upcoming" / live computation in the
  // sections below, so SSR is deterministic and hydration-stable (no per-render new Date that the
  // client could re-evaluate to a different value). Captured once per request.
  const nowISO = new Date().toISOString();

  // The state-aware matchday card needs the champion (for COMPLETE) and, when a fixture is LIVE, an
  // in-progress score IF one is reliably persisted. The champion comes from the projected bracket
  // (M104 winner); the live-score read is FILTERED to the single live match (scaling-guard-safe) and
  // only issued when the card is actually LIVE, so the common (non-live) page does zero extra work.
  let champion: string | null = null;
  let liveScore: LiveScore | null = null;
  if (index) {
    const card = matchdayCardState(fixtures, index, nowISO, null);
    if (card.state === "complete") {
      try {
        // Prefer the projected-bracket champion; fall back to the final fixture's resolved winner.
        champion = (await getProjectedBracket())?.champion ?? card.result?.team_a ?? null;
      } catch {
        champion = card.result?.team_a ?? null;
      }
    } else if (card.state === "live") {
      liveScore = await getLiveScore(card.fixture.match_id);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-fg">Matches</h1>
      <p className="text-sm text-secondary">
        Every fixture of the tournament, group stage through the Final, with the model&apos;s
        odds, and final scores as results come in. Open any round, then any match, for the full
        breakdown.
      </p>

      {/* matchday calendar + per-day briefings (absorbed /daily) */}
      {index ? (
        <DailyCalendar
          index={index}
          fixtures={fixtures}
          nowISO={nowISO}
          champion={champion}
          liveScore={liveScore}
        />
      ) : (
        <p className="mt-4 text-xs text-muted">
          The matchday calendar is unavailable right now. The tournament runs{" "}
          {TOURNAMENT_START} → {TOURNAMENT_END}.
        </p>
      )}

      {/* the full fixture list, as collapsible round-aware sections, behind a team search island */}
      <div className="mt-6">
        <MatchesSearch fixtures={fixtures} nowISO={nowISO} />
      </div>
    </div>
  );
}

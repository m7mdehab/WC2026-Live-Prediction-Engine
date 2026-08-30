import { getHomeData, type TitleRaceRow } from "@/lib/data";
import { getDailyBriefing, TOURNAMENT_END, TOURNAMENT_START, type DailyBriefing } from "@/lib/data/daily";
import { getTitleOddsHistory, type TitleOddsHistory } from "@/lib/data/titleOddsHistory";
import { getComparisonData, tieAwareRanks } from "@/lib/data/humans";
import { getAwardRaces } from "@/lib/data/players";
import type { AwardRaceEntry } from "@/lib/types/players";
import { DesktopShell } from "@/components/home/DesktopShell";
import { MobileShell } from "@/components/home/MobileShell";
import { HomeFeed } from "@/components/home/HomeFeed";
import type { HumanRow } from "@/components/home/AiVsHumansCard";
import type { ChampionContext, ModelPredictionRun, UpcomingMatch } from "@/lib/types";
import { buildNextMatchCard, selectNextMatch, type NextMatchCard } from "@/lib/data/nextMatch";
import { getModelRetrospective, preTournamentCall, type RetrospectiveRow, type PreTournamentCall } from "@/lib/data/retrospective";

// ISR (Track C static seal). The freshness/freeze oracles are now BOUNDED (freeze.ts + version.ts:
// unstable_cache, TTL <= the live data TTL, build id in key), so this route no longer opts out of static
// rendering. Live freshness is preserved WITHOUT force-dynamic: the RESULT_SURFACES revalidatePath fan-out
// busts it on any write, the version-keyed Data Cache mints a new key on any run/result. Reversible with
// NO date - a future live season stays fresh via that write-path revalidation + the isFrozen-gated data TTL.
export const revalidate = 3600;

export default async function Home() {
  let run: ModelPredictionRun | null = null;
  let champion: ChampionContext | null = null;
  let leaderboard: TitleRaceRow[] = [];
  let titleHistory: TitleOddsHistory | null = null;
  let upcoming: UpcomingMatch[] = [];
  let upcomingTotal = 0;

  try {
    const home = await getHomeData({ leaderboardSize: 8, upcomingLimit: 16 });
    run = home.run;
    champion = home.champion;
    leaderboard = home.leaderboard;
    upcoming = home.upcoming;
    upcomingTotal = home.upcomingTotal;
  } catch (err) {
    console.error("Failed to load home data from Supabase:", err);
  }

  // The countdown hero's "next match" mode: the soonest unplayed, resolved fixture (knockout sides are
  // already overlaid from the projected bracket inside getHomeData), assembled into a compact,
  // serialisable card. Fail-soft to null so the toggle simply hides when there is no next match
  // (tournament over, none scheduled, or unresolved knockout).
  const nextMatch: NextMatchCard | null = buildNextMatchCard(selectNextMatch(upcoming));

  // The title-odds-over-time trajectory: an independent, cached read of the retained forecast
  // history. Kept separate from getHomeData so a history hiccup can never blank the leaderboard;
  // the chart degrades to its pre-tournament baseline cluster when this is null.
  try {
    titleHistory = await getTitleOddsHistory();
  } catch (err) {
    console.error("Failed to load title-odds history for home:", err);
  }

  // Daily brief digest: REUSES the daily layer (getDailyBriefing for today + yesterday, UTC) -
  // no new query shapes beyond what /daily already runs. Yesterday only contributes its recap
  // headline (the "Called it / Upset" one-liner) and only when results were recorded.
  let dailyBrief: DailyBriefing | null = null;
  let yesterdayLine: string | null = null;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
      .toISOString().slice(0, 10);
    const wantYesterday = yesterday >= TOURNAMENT_START && yesterday <= TOURNAMENT_END;
    const [t, y] = await Promise.all([
      getDailyBriefing(today),
      wantYesterday ? getDailyBriefing(yesterday) : Promise.resolve(null),
    ]);
    dailyBrief = t;
    yesterdayLine = y && y.auto.recap.length > 0 ? y.auto.headline : null;
  } catch (err) {
    console.error("Failed to load the daily brief for home:", err);
  }

  // Golden-boot race digest: fed from getAwardRaces().goldenBoot -- the SAME broadened, actuals-first
  // board the /players Golden Boot card renders, so the home card and /players AGREE (a cross-role
  // scorer like a 3-goal MF appears on both, in the same order). Fail-soft to an empty board (card
  // then renders nothing).
  let bootRaceBoard: AwardRaceEntry[] = [];
  try {
    const races = await getAwardRaces();
    bootRaceBoard = races.goldenBoot;
  } catch (err) {
    console.error("Failed to load the golden-boot race for home:", err);
  }

  // AI-vs-Humans digest: top 5 scored entries + the model benchmark, via the humans track's
  // existing read API. Only display_name + points cross to the UI (PII never leaves humans.ts).
  let humanRows: HumanRow[] = [];
  let aiChampion: string | null = null;
  let humansMode: "projection" | "results" = "projection";
  let humanTotal = 0;
  try {
    const cmp = await getComparisonData();
    // TIE-AWARE joint ranks over the FULL board (so a tie spanning the slice boundary still ranks
    // correctly), then take the top 5 for the home card. The model is already pinned first within its
    // points tie by getComparisonData's byScore ordering; tieAwareRanks gives it a JOINT rank shared
    // with any humans on its exact score (never a solo rank above a strictly higher human score).
    const ranks = tieAwareRanks(cmp.entries);
    const rankCounts = ranks.reduce<Record<number, number>>(
      (m, r) => ((m[r] = (m[r] ?? 0) + 1), m), {});
    humanRows = cmp.entries.slice(0, 5).map((e, i) => ({
      name: e.displayName,
      points: e.score.points,
      maxPoints: e.score.maxPoints,
      rank: ranks[i],
      joint: rankCounts[ranks[i]] > 1,
      isModel: !!e.isModel,
    }));
    aiChampion = cmp.model?.champion ?? null;
    humansMode = cmp.mode;
    humanTotal = cmp.entries.length;
  } catch (err) {
    console.error("Failed to load AI-vs-Humans data for home:", err);
  }

  // Tournament finished (Phase 3): the site flips from a live forecaster to a settled retrospective.
  // Deterministic date signal - the scheduled window has closed; no extra read, SSR/client agree.
  const complete = new Date().toISOString().slice(0, 10) > TOURNAMENT_END;

  // Track B: in complete mode the live Title race order is DEGENERATE (47 teams at champion 0 -> the
  // stable sort leaves alphabetical order), so it is replaced by the model's pre-tournament top 8
  // ordered by cond0 champion odds + each team's ACTUAL finish. Fail-soft to [] (the card then shows its
  // own unavailable state); only fetched in complete mode.
  const retrospective: RetrospectiveRow[] | null = complete ? await getModelRetrospective() : null;
  // The pre-tournament call the model earned (F1), derived from those same cond0-ordered rows +
  // actual finishes - a fact of the data, made only when true. Fed to the champion hero in settled mode.
  const preCall: PreTournamentCall | null = retrospective ? preTournamentCall(retrospective) : null;

  // The two shells are built here (server-side) and handed to HomeFeed, which renders only the
  // active one once mounted so the heavy/interactive pieces don't double-render.
  return (
    <HomeFeed
      desktop={
        <DesktopShell
          champion={champion}
          leaderboard={leaderboard}
          titleHistory={titleHistory}
          upcoming={upcoming}
          upcomingTotal={upcomingTotal}
          run={run}
          dailyBrief={dailyBrief}
          yesterdayLine={yesterdayLine}
          bootRaceBoard={bootRaceBoard}
          humans={humanRows}
          aiChampion={aiChampion}
          humansMode={humansMode}
          humanTotal={humanTotal}
          nextMatch={nextMatch}
          complete={complete}
          retrospective={retrospective}
          preCall={preCall}
        />
      }
      mobile={
        <MobileShell
          champion={champion}
          leaderboard={leaderboard}
          titleHistory={titleHistory}
          upcoming={upcoming}
          upcomingTotal={upcomingTotal}
          run={run}
          dailyBrief={dailyBrief}
          yesterdayLine={yesterdayLine}
          bootRaceBoard={bootRaceBoard}
          humans={humanRows}
          aiChampion={aiChampion}
          humansMode={humansMode}
          humanTotal={humanTotal}
          nextMatch={nextMatch}
          complete={complete}
          retrospective={retrospective}
          preCall={preCall}
        />
      }
    />
  );
}

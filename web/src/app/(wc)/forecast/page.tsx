import type { Metadata } from "next";
import { getForecastData } from "@/lib/data/forecast";
import { TOURNAMENT_END } from "@/lib/data/daily";
import { getResolvedStages, type ResolvedStages } from "@/lib/data/resolvedStagesData";
import { getProjectedBracket, getPreTournamentBracket, getPreTournamentChampionPct } from "@/lib/data";
import { settledPodium } from "@/lib/data/podium";
import { getTitleOddsHistory, type TitleOddsHistory } from "@/lib/data/titleOddsHistory";
import { ForecastView } from "@/components/forecast/ForecastView";
import { DualProjectionCard } from "@/components/forecast/DualProjectionCard";
import { BracketTabs } from "@/components/bracket/BracketTabs";
import { OddsTimeMachine } from "@/components/dashboard/forecast/OddsTimeMachine";
import type { ForecastData } from "@/lib/types/forecast";
import type { ProjectedBracket } from "@/lib/types";

export const metadata: Metadata = {
  title: "Forecast",
  description:
    "Champion probability for all 48 teams from a Monte-Carlo simulation, dark horses and overvalued reads, plus the model's projected knockout bracket.",
  alternates: { canonical: "/forecast" },
};

// ISR (Track C static seal). The freshness/freeze oracles are now BOUNDED (freeze.ts + version.ts) and the
// live run-id freshness check moved client-side (ForecastFreshnessClient -> /api/live-run), so this route
// no longer opts out of static rendering. Live freshness is preserved WITHOUT force-dynamic: RESULT_SURFACES
// revalidatePath busts it on any write and the version-keyed Data Cache mints a new key on any run/result.
// Reversible with NO date - a future live season stays fresh via that revalidation + the isFrozen data TTL.
export const revalidate = 3600;

export default async function ForecastPage() {
  // Four independent reads, each fail-soft on its own: the live forecast, the live projected bracket,
  // the FROZEN cond0 bracket (for the dual card's initial pick), and the cond0 champion% (for the
  // initial pick's probability). A cond0 outage degrades only the dual card's LEFT half.
  // (+ resolved-stage verdicts for the badges, and the retained title-odds history for the Odds Time
  // Machine strip - two extra reads; each fails soft on its own.)
  const [forecastRes, bracketRes, cond0BracketRes, cond0PctRes, resolutionRes, historyRes] = await Promise.allSettled([
    getForecastData(),
    getProjectedBracket(),
    getPreTournamentBracket(),
    getPreTournamentChampionPct(),
    getResolvedStages(),
    getTitleOddsHistory(),
  ]);
  const data: ForecastData | null =
    forecastRes.status === "fulfilled" ? forecastRes.value : null;
  // Resolved-stage verdicts (achieved/failed/in-progress + "was NN%"). Fail-soft: a bad read degrades
  // the badges to absent (every cell then shows its live probability), never blanking the forecast.
  const resolution: ResolvedStages | undefined =
    resolutionRes.status === "fulfilled" ? resolutionRes.value : undefined;
  const bracket: ProjectedBracket | null =
    bracketRes.status === "fulfilled" ? bracketRes.value : null;
  const cond0Bracket: ProjectedBracket | null =
    cond0BracketRes.status === "fulfilled" ? cond0BracketRes.value : null;
  const cond0Champ: { team: string; champion: number } | null =
    cond0PctRes.status === "fulfilled" ? cond0PctRes.value : null;
  const history: TitleOddsHistory | null =
    historyRes.status === "fulfilled" ? historyRes.value : null;
  // Track C: the live run-id freshness check moved to the client (ForecastFreshnessClient -> /api/live-run),
  // so /forecast can render statically. The no-store read that used to live here is gone.
  if (forecastRes.status === "rejected") {
    console.error("Failed to load forecast data:", forecastRes.reason);
  }
  if (bracketRes.status === "rejected") {
    console.error("Failed to load projected bracket:", bracketRes.reason);
  }
  if (cond0BracketRes.status === "rejected") {
    console.error("Failed to load pre-tournament bracket:", cond0BracketRes.reason);
  }
  if (cond0PctRes.status === "rejected") {
    console.error("Failed to load pre-tournament champion %:", cond0PctRes.reason);
  }
  if (resolutionRes.status === "rejected") {
    console.error("Failed to load resolved-stage verdicts:", resolutionRes.reason);
  }
  if (historyRes.status === "rejected") {
    console.error("Failed to load title-odds history:", historyRes.reason);
  }

  // Dual card: the live (current) champion is the top team by champion% in the live forecast; the
  // initial (cond0) pick is the frozen cond0 champion + its cond0 champion%. Render only when a live
  // champion exists; the LEFT half degrades to "unavailable" when no cond0 pick is present.
  const liveTop = data?.teams?.[0] ?? null;
  const liveChampion =
    liveTop && liveTop.champion != null ? { team: liveTop.team, champion: liveTop.champion } : null;
  const initialPick =
    cond0Bracket?.champion && cond0Champ && cond0Champ.team === cond0Bracket.champion
      ? { team: cond0Champ.team, champion: cond0Champ.champion }
      : null;
  // Phase 3 settled framing (same deterministic date signal as the home): once the tournament has
  // ended, the dual card shows the champion as a FACT, not a live "current pick" probability + delta.
  const complete = new Date().toISOString().slice(0, 10) > TOURNAMENT_END;
  // Settled podium (champion, runner-up, third, fourth) from the resolved M104/M103. Feeds the Odds
  // Time Machine's DEFAULT selection so it opens on the four teams that actually finished 1st..4th,
  // not the degenerate current-odds order. Null pre-settlement -> the strip keeps its live default.
  const podium = complete ? settledPodium(bracket) : null;

  return (
    <>
      {/* ---- Projected bracket FIRST (absorbed /bracket; /forecast#bracket lands here at the top).
              The forecast table + insights (carrying the single page h1) sit below. ---- */}
      <section id="bracket" aria-label="Projected bracket" className="scroll-mt-20">
        {/* Odds Time Machine strip: top-5 title odds (+ the biggest since-kickoff faller) scrubbed
            across the retained cond-steps. Sits ABOVE the dual projection card; fails soft to
            static current-% chips (no history) or to nothing (no data at all). */}
        <OddsTimeMachine teams={data?.teams ?? null} history={history} podium={podium} />

        {/* Dual projection card: the FROZEN cond0 initial pick vs the CURRENT live pick + the delta.
            Visible at 390px and desktop, near the top of the bracket section. Renders only when a live
            champion exists; the LEFT half degrades to a visible "unavailable" state when no cond0 pick. */}
        {liveChampion ? (
          <div className="mb-6">
            <DualProjectionCard initial={initialPick} current={liveChampion} complete={complete} />
          </div>
        ) : null}

        {/* Bracket source toggle (Current = live/current bracket; Initial = frozen pre-tournament
            bracket). The SAME two viewport blocks (a `hidden xl:block` DesktopBracket breakout + a
            `xl:hidden` BracketFlow) render under whichever tab is selected, so mobile AND desktop
            share the toggle. Both brackets are already fetched server-side; passing both to the
            client wrapper is the same, safe serialization BracketFlow already does today. */}
        <BracketTabs current={bracket} initial={cond0Bracket} complete={complete} />

        <p className="mt-4 text-xs">
          <a href="#forecast" className="text-secondary underline-offset-2 hover:underline">
            See the full forecast ↓
          </a>
        </p>
      </section>

      {/* ---- Forecast table + insights (the single page h1 lives here, in ForecastView) ---- */}
      <div id="forecast" className="mt-10 scroll-mt-20">
        <ForecastView data={data} bracketAnchor="#bracket" resolution={resolution} />
      </div>
    </>
  );
}

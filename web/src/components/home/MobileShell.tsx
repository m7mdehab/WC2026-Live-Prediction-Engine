import { CountdownHero } from "@/components/home/CountdownHero";
import { ChampionHero } from "@/components/home/ChampionHero";
import { Leaderboard } from "@/components/home/Leaderboard";
import { ModelRetrospectiveCard } from "@/components/home/ModelRetrospectiveCard";
import { ProbabilityOverTimeChart } from "@/components/home/ProbabilityOverTimeChart";
import { UpcomingMatches } from "@/components/home/UpcomingMatches";
import { DailyBriefCard } from "@/components/home/DailyBriefCard";
import { GoldenBootRaceCard } from "@/components/home/GoldenBootRaceCard";
import { AiVsHumansCard, type HumanRow } from "@/components/home/AiVsHumansCard";
import { FeatureCard } from "@/components/home/panels";
import type { AwardRaceEntry } from "@/lib/types/players";
import type { TitleRaceRow } from "@/lib/data";
import type { DailyBriefing } from "@/lib/data/daily";
import type { TitleOddsHistory } from "@/lib/data/titleOddsHistory";
import type { ChampionContext, ModelPredictionRun, UpcomingMatch } from "@/lib/types";
import type { NextMatchCard } from "@/lib/data/nextMatch";
import type { RetrospectiveRow, PreTournamentCall } from "@/lib/data/retrospective";

/** Mobile surface: a purpose-built single-column vertical feed (< lg), not a squeezed dashboard.
 *  Reuses the same components as desktop (champion hero, leaderboard, over-time chart, upcoming),
 *  stacked in reading order. Gated by `lg:hidden`. The chart takes the mobile variant for
 *  legibility at phone width. Bottom padding (from AppFrame) clears the fixed MobileNav. */
export function MobileShell({
  champion,
  leaderboard,
  titleHistory,
  upcoming,
  upcomingTotal,
  run,
  dailyBrief,
  yesterdayLine,
  bootRaceBoard,
  humans,
  aiChampion,
  humansMode,
  humanTotal,
  nextMatch,
  complete,
  retrospective,
  preCall,
}: {
  champion: ChampionContext | null;
  leaderboard: TitleRaceRow[];
  titleHistory: TitleOddsHistory | null;
  upcoming: UpcomingMatch[];
  upcomingTotal: number;
  run: ModelPredictionRun | null;
  dailyBrief: DailyBriefing | null;
  yesterdayLine: string | null;
  bootRaceBoard: AwardRaceEntry[];
  humans: HumanRow[];
  aiChampion: string | null;
  humansMode: "projection" | "results";
  humanTotal: number;
  nextMatch: NextMatchCard | null;
  /** Tournament finished: render settled-retrospective framing (Phase 3). */
  complete: boolean;
  /** Model's pre-tournament top 8 + actual finish, shown INSTEAD of the live Title race in complete mode. */
  retrospective: RetrospectiveRow[] | null;
  /** The pre-tournament call the model earned, for the champion hero in settled mode (F1). */
  preCall: PreTournamentCall | null;
}) {
  return (
    <div className="flex flex-col gap-4 lg:hidden">
      <CountdownHero nextMatch={nextMatch} complete={complete} />

      <div>
        <h1 className="font-display text-xl font-bold text-fg">Tournament Forecast</h1>
        <p className="text-sm text-secondary">A calibrated, probabilistic AI forecast.</p>
      </div>

      <ChampionHero champion={champion} run={run} complete={complete} preCall={preCall} />
      {complete ? (
        <ModelRetrospectiveCard rows={retrospective ?? []} />
      ) : (
        <Leaderboard rows={leaderboard} settled={false} />
      )}
      {!complete && dailyBrief ? <DailyBriefCard brief={dailyBrief} yesterdayLine={yesterdayLine} /> : null}
      <GoldenBootRaceCard board={bootRaceBoard} />
      <ProbabilityOverTimeChart
        contenders={leaderboard.slice(0, 5)}
        series={titleHistory?.series ?? []}
        nowMatchesPlayed={titleHistory?.currentMatchesPlayed}
        totalMatches={titleHistory?.totalMatches}
        variant="mobile"
      />
      {!complete ? <UpcomingMatches matches={upcoming} total={upcomingTotal} variant="mobile" /> : null}

      {/* (predict CTA unified into the CountdownHero above the fold) */}

      {/* live destination cards */}
      <AiVsHumansCard
        humans={humans}
        aiChampion={aiChampion}
        mode={humansMode}
        total={humanTotal}
        complete={complete}
      />
      <FeatureCard
        href="/methodology"
        title="Methodology"
        teaser="How the forecast is built: Elo, Dixon–Coles, Monte Carlo, and backtests."
        cta="Read"
      />
    </div>
  );
}

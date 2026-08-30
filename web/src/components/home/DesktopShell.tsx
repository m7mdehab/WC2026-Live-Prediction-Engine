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

/** Desktop surface: a multi-panel dashboard grid (≥ lg). Distinct layout from mobile,
 *  not a reflow. Gated by `hidden lg:grid`. This is the design-lock surface. */
export function DesktopShell({
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
  /** The model's pre-tournament top 8 + actual finish, shown INSTEAD of the live Title race in complete
   *  mode (the live order is degenerate once every team is at champion 0). */
  retrospective: RetrospectiveRow[] | null;
  /** The pre-tournament call the model earned, for the champion hero in settled mode (F1). */
  preCall: PreTournamentCall | null;
}) {
  return (
    <div className="hidden grid-cols-12 gap-4 lg:grid">
      <div className="col-span-12">
        <CountdownHero nextMatch={nextMatch} complete={complete} />
      </div>

      <div className="col-span-12">
        <h1 className="font-display text-2xl font-bold text-fg">Tournament Forecast</h1>
        <p className="text-sm text-secondary">A calibrated, probabilistic AI forecast.</p>
      </div>

      {/* primary column */}
      <div className="col-span-8 flex flex-col gap-4">
        <ChampionHero champion={champion} run={run} complete={complete} preCall={preCall} />
        <ProbabilityOverTimeChart
          contenders={leaderboard.slice(0, 5)}
          series={titleHistory?.series ?? []}
          nowMatchesPlayed={titleHistory?.currentMatchesPlayed}
          totalMatches={titleHistory?.totalMatches}
        />
        {/* Upcoming matches is live-only framing ("No upcoming matches scheduled"); hidden once settled. */}
        {!complete ? <UpcomingMatches matches={upcoming} total={upcomingTotal} /> : null}
      </div>

      {/* side column: title race, then the daily-brief digest, then the live AI-vs-Humans table
          (the predict CTA is unified into the CountdownHero above the fold). */}
      <div className="col-span-4 flex flex-col gap-4">
        {complete ? (
          <ModelRetrospectiveCard rows={retrospective ?? []} />
        ) : (
          <Leaderboard rows={leaderboard} settled={false} />
        )}
        {/* The daily brief ("Rest day" / today's matches) is live-only framing; hidden once settled. */}
        {!complete && dailyBrief ? <DailyBriefCard brief={dailyBrief} yesterdayLine={yesterdayLine} /> : null}
        <GoldenBootRaceCard board={bootRaceBoard} />
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
    </div>
  );
}

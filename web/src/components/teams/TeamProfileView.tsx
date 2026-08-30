import Link from "next/link";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { FormChips } from "@/components/ui/FormChips";
import { TeamForecastBlock } from "@/components/teams/TeamForecastBlock";
import { TeamGroupCard } from "@/components/teams/TeamGroupCard";
import { TeamFixturesList } from "@/components/teams/TeamFixturesList";
import { Gauntlet } from "@/components/teams/Gauntlet";
import { TitleRaceStrip } from "@/components/teams/TitleRaceStrip";
import { TeamKeyPlayers } from "@/components/players/TeamKeyPlayers";
import type { TeamProfile, TeamFixture } from "@/lib/types/teams";
import type { FormMatch } from "@/lib/types";
import type { TitleOddsHistory } from "@/lib/data/titleOddsHistory";
import type { TeamsIndex } from "@/lib/types/teams";
import type { TeamPlayerLink } from "@/lib/data/players";

/** "7 Jun 2026" from the run timestamp (UTC, deterministic - mirrors the forecast/home pages). */
function formatUpdated(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(iso));
}

/** The team's recent competitive form (most-recent first) derived from its OWN completed fixtures.
 *  Nothing invented: a row exists only when a real final score is recorded. W/D/L reads from the
 *  team's perspective, honouring a recorded shootout winner on a level score. */
function buildForm(fixtures: TeamFixture[], team: string): FormMatch[] {
  return fixtures
    .filter((f) => f.finished && f.homeScore != null && f.awayScore != null)
    .sort((a, b) => (b.kickoffUtc ?? "").localeCompare(a.kickoffUtc ?? "")) // most-recent first
    .map((f): FormMatch => {
      const gf = f.teamIsHome ? f.homeScore! : f.awayScore!;
      const ga = f.teamIsHome ? f.awayScore! : f.homeScore!;
      const result: "W" | "D" | "L" = f.winnerTeam
        ? f.winnerTeam === team ? "W" : "L"
        : gf > ga ? "W" : gf < ga ? "L" : "D";
      return {
        date: (f.kickoffUtc ?? "").slice(0, 10),
        opponent: f.opponent,
        venue: "neutral",
        score: `${gf}-${ga}`,
        result,
        competition: "World Cup",
        opponent_rank: null,
        notable: false,
      };
    });
}

/** A team profile: identity + form + title-race + gauntlet + forecast + projected group finish +
 *  fixtures/results + squad cross-link, with honest model framing. Every section is fail-soft: a
 *  missing input renders nothing rather than erroring. */
export function TeamProfileView({
  profile,
  keyPlayers = [],
  titleHistory = null,
  teamsIndex = null,
}: {
  profile: TeamProfile;
  /** The team's tracked players (cross-link to the players feature); empty hides the section. */
  keyPlayers?: TeamPlayerLink[];
  /** Retained champion-odds history for the title-race strip (fail-soft: null hides the strip). */
  titleHistory?: TitleOddsHistory | null;
  /** Current teams index (live champion % for the title-race edge labels); null is fine. */
  teamsIndex?: TeamsIndex | null;
}) {
  const { team, groupCode, hostFlag, fifaRank, elo, forecast, groupFinish, groupMates, fixtures, run, demo } = profile;

  const conditioned =
    run && run.conditioned_on_results > 0
      ? `conditioned on ${run.conditioned_on_results} result(s)`
      : "pre-tournament";

  const form = buildForm(fixtures, team);

  return (
    <section className="mx-auto max-w-4xl">
      {/* breadcrumb */}
      <Link href="/teams" className="text-xs font-medium text-muted hover:text-fg hover:underline">
        ← All teams
      </Link>

      {/* identity - the flag opts out of the site-wide link (this IS the team's own page) */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="flex items-center gap-3 font-display text-3xl font-bold text-fg">
          <Flag team={team} size="text-3xl" link={false} />
          {team}
        </h1>
        {hostFlag ? <Tag variant="gold">Host</Tag> : null}
        {demo ? <Tag variant="upset">Sample data</Tag> : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary">
        {groupCode ? (
          <span>
            Group <Link href="/groups" className="font-medium text-fg hover:underline">{groupCode}</Link>
          </span>
        ) : null}
        {fifaRank != null ? <span className="tnum">FIFA #{fifaRank}</span> : null}
        {elo != null ? <span className="tnum">Elo {elo}</span> : null}
      </div>
      {run ? (
        <p className="tnum mt-2 text-xs text-muted">
          Model {run.model_version} · {run.iterations.toLocaleString()} simulations · {conditioned} ·
          Updated {formatUpdated(run.created_at)}
        </p>
      ) : null}

      {/* recent form - most-recent first; renders nothing until a real result exists */}
      {form.length > 0 ? (
        <div className="mt-3">
          <FormChips team={team} form={form} />
        </div>
      ) : null}

      {/* MERGE SEAM (w2/w4): the W2-consistent resolved-result badges and the Wave-4 surprise index
          for this team live on review/w2-honest-numbers and review/w4-sticky-metrics, NOT main.
          They are intentionally NOT reimplemented here (that would duplicate/diverge). Wire them at
          MERGE time once w2/w4 land in main - mount point is here, above the odds-over-time strip. */}

      {/* odds-over-time: the ported Title Race strip (this team pre-highlighted when in the top 6) */}
      <div className="mt-5">
        <TitleRaceStrip history={titleHistory} index={teamsIndex} focusTeam={team} />
      </div>

      {/* round-qualification trajectory: the ported Gauntlet funnel */}
      <Gauntlet team={team} forecast={forecast} />

      {/* forecast + group finish */}
      <div className="mt-1 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TeamForecastBlock forecast={forecast} />
        <TeamGroupCard finish={groupFinish} mates={groupMates} />
      </div>

      {/* fixtures + results in one place */}
      <div className="mt-4">
        <TeamFixturesList fixtures={fixtures} team={team} />
      </div>

      {/* MERGE/DATA SEAM: the projected knockout PATH (likely R16/QF opponents) and the historical
          HEAD-TO-HEAD record are deferred. KO fixture teams are NULL until the bracket resolves, and
          there is no international-results corpus on main (the committed data/corpus is club football
          and is a standing no-touch), so a truthful path/H2H cannot be built here yet. Wire once a KO
          resolution + a national-team corpus land - mount point is here, below fixtures. */}

      {/* squad ranked from ingested player stats, each linking to /players/[id] (hidden when none) */}
      {keyPlayers.length > 0 ? (
        <div className="mt-4">
          <TeamKeyPlayers players={keyPlayers} />
        </div>
      ) : null}

      {/* honest framing + deferred scope */}
      <div className="mt-4 rounded-card border border-border bg-bg-subtle p-4">
        <p className="max-w-prose text-xs leading-relaxed text-secondary">
          Probabilistic odds, not predictions of certainty{run ? ` (${conditioned})` : ""}.{" "}
          <Link href="/methodology#forecast-reads" className="text-confident hover:underline">
            How the forecast is built
          </Link>
          . Independent project, not affiliated with FIFA.
        </p>
        <p className="mt-2 text-xs text-muted">
          Projected knockout path &amp; head-to-head history: coming with the knockout draw and the
          national-team results corpus.
        </p>
      </div>
    </section>
  );
}

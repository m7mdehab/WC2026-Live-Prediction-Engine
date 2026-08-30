import { Tag } from "@/components/ui/Tag";
import { ForecastTable, type ResolutionMap } from "@/components/forecast/ForecastTable";
import { DarkHorsesCard, OvervaluedCard } from "@/components/forecast/ForecastInsights";
import type { ForecastData } from "@/lib/types/forecast";
import { sortForecastTeams } from "@/lib/data/forecastSort";
import { ForecastFreshnessClient } from "@/components/forecast/ForecastFreshnessClient";

/** "7 Jun 2026" from the run timestamp (UTC, deterministic - mirrors the home hero). */
function formatUpdated(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(iso));
}

/** The full tournament forecast: one champion-probability ranking for all 48 teams (top 10 leading,
 *  the rest behind a collapsed dropdown), with honest dark-horse / overvalued reads. Pure
 *  presentation - all numbers come from the run. */
export function ForecastView({
  data,
  bracketAnchor,
  resolution,
}: {
  data: ForecastData | null;
  /** In-page anchor of the projected-bracket section (e.g. "#bracket") - renders a jump link. */
  bracketAnchor?: string;
  /** Per (team, stage) resolved-stage verdicts + "was NN%". Optional: absent -> every cell renders its
   *  live probability, unchanged. */
  resolution?: ResolutionMap;
}) {
  if (!data || data.teams.length === 0) {
    return (
      <section>
        <h1 className="font-display text-2xl font-bold text-fg">Forecast</h1>
        <p className="mt-2 max-w-prose text-sm text-secondary">No forecast published yet.</p>
      </section>
    );
  }

  const { run, teams, darkHorses, overvalued, demo } = data;
  // 3b: order as a model-standing ranking end to end. Alive teams by current champ odds; ELIMINATED
  // teams (results-driven, not prob==0) by their LAST LIVE champ odds - never alphabetically.
  const orderedTeams = sortForecastTeams(teams, resolution);
  const conditioned =
    run && run.conditioned_on_results > 0
      ? `conditioned on ${run.conditioned_on_results} results`
      : "pre-tournament";

  return (
    <section>
      <ForecastFreshnessClient run={run} />
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-bold text-fg">Forecast</h1>
        {demo ? <Tag variant="upset">Sample data</Tag> : null}
      </div>
      <p className="max-w-prose text-sm text-secondary">
        The model&apos;s title odds for every team, from a Monte-Carlo run over the full bracket:
        champion probability for all {teams.length} teams, with each team&apos;s path from the group
        stage through the quarter-final, semi-final and final. The leading contenders lead; the rest of
        the field is one tap away.
      </p>
      {run ? (
        <p className="tnum mt-2 text-xs text-muted">
          Model {run.model_version} · {run.iterations.toLocaleString()} simulations · {conditioned} ·
          Updated {formatUpdated(run.created_at)}
        </p>
      ) : null}
      {bracketAnchor ? (
        <p className="mt-2 text-xs">
          <a href={bracketAnchor} className="font-medium text-confident hover:underline">
            Back to the projected bracket ↑
          </a>
        </p>
      ) : null}

      {/* headline: the merged champion-probability ranking - top 10 leading, the rest behind a
          collapsed "Show all 48 teams" dropdown. Champion probability appears exactly once. */}
      <div className="mt-5">
        <ForecastTable teams={orderedTeams} resolution={resolution} />
      </div>

      {/* honest editorial reads, derived from the same numbers */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DarkHorsesCard teams={darkHorses} />
        <OvervaluedCard teams={overvalued} />
      </div>
    </section>
  );
}

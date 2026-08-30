import { teamSlug } from "@/lib/teamSlug";
import type { TitleOddsHistory } from "@/lib/data/titleOddsHistory";
import type { TeamsIndex } from "@/lib/types/teams";
import { TitleRaceClient, type RaceMover, type RaceRow } from "./TitleRaceClient";

// Ported (re-created) from feature/page-dashboards components/dashboard/teams/TitleRaceStrip.tsx
// for the Wave-6 team page. Server island: reads the retained champion-odds history + the current
// teams index (both live on main) and hands the client only the top-6 slice + overnight movers.

/** |delta| threshold for the overnight movers, in probability (0.3 percentage points). */
const MOVER_MIN = 0.003;

/** Teams strip "Title Race + Movers" (server): assembles the top-6 champion-odds trajectories
 *  (kickoff -> now, x = matchesPlayed) plus the top-3 risers/fallers between the LAST TWO retained
 *  steps, and hands only that slice to the client island. The live label % prefers the teams-index
 *  read (the same run the page below renders) and falls back to the history's last step.
 *
 *  `focusTeam` (the profile's own nation) is forwarded so the client pre-highlights that line when
 *  it appears in the top 6.
 *
 *  Fail-soft: empty history -> strip absent; a single step -> dots only, movers hidden. */
export function TitleRaceStrip({
  history,
  index,
  focusTeam,
}: {
  history: TitleOddsHistory | null;
  index: TeamsIndex | null;
  focusTeam?: string;
}) {
  if (!history || history.series.length === 0) return null;
  const steps = history.series[0].points.map((p) => p.matchesPlayed);
  if (steps.length === 0) return null;

  // Re-key each series by matchesPlayed so a short/odd series can never mis-align a row.
  const byTeam = new Map<string, Map<number, number>>(
    history.series.map((s) => [s.team, new Map(s.points.map((p) => [p.matchesPlayed, p.champion]))]),
  );
  const valuesFor = (team: string): number[] => {
    const m = byTeam.get(team);
    return steps.map((mp) => m?.get(mp) ?? 0);
  };
  const lastOf = (vals: number[]) => vals[vals.length - 1] ?? 0;

  // Live champion % per team from the index (same run as the page below), else the history tail.
  const liveChampion = new Map<string, number>();
  for (const g of index?.groups ?? []) {
    for (const t of g.teams) {
      if (t.champion != null) liveChampion.set(t.team, t.champion);
    }
  }

  const rows: RaceRow[] = [...byTeam.keys()]
    .map((team) => {
      const values = valuesFor(team);
      return {
        team,
        id: teamSlug(team),
        values,
        current: liveChampion.get(team) ?? lastOf(values),
      };
    })
    .sort((a, b) => lastOf(b.values) - lastOf(a.values))
    .slice(0, 6);
  if (rows.length === 0) return null;

  // Overnight movers: delta between the last two retained steps, across ALL teams, thresholded at
  // |delta| >= 0.3pp; top-3 each way. Hidden entirely on a single step.
  let risers: RaceMover[] = [];
  let fallers: RaceMover[] = [];
  if (steps.length >= 2) {
    const deltas = [...byTeam.keys()].map((team) => {
      const vals = valuesFor(team);
      const value = lastOf(vals);
      return { team, value, delta: value - (vals[vals.length - 2] ?? 0) };
    });
    risers = deltas
      .filter((d) => d.delta >= MOVER_MIN)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 3);
    fallers = deltas
      .filter((d) => d.delta <= -MOVER_MIN)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 3);
  }

  return <TitleRaceClient rows={rows} steps={steps} risers={risers} fallers={fallers} focusTeam={focusTeam} />;
}

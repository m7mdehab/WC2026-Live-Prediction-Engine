import { LiveStrip } from "@/components/strip";
import { Flag } from "@/components/ui/Flag";
import { simPct } from "@/lib/utils";
import type { TitleOddsHistory } from "@/lib/data/titleOddsHistory";
import type { ForecastTeam } from "@/lib/types/forecast";
import { OddsTimeMachineClient, type TimeMachineRow } from "./OddsTimeMachineClient";
import { pickDefaultSelection } from "./timeMachineLogic";

/** Static fallback chip (no history / < 2 steps): flag + name + current champion %, in the rail. */
function StaticOddsChip({ team, champion }: { team: string; champion: number | null }) {
  if (!team || champion == null || !Number.isFinite(champion)) return null;
  return (
    <div className="flex h-full w-40 min-w-0 flex-col justify-center gap-1 rounded-md border border-border bg-bg-subtle p-2.5 md:w-auto">
      <span className="flex min-w-0 items-center gap-1.5">
        <Flag team={team} size="text-lg" />
        <span className="truncate text-sm font-semibold text-fg">{team}</span>
      </span>
      <span className="tnum text-sm font-semibold text-gold-strong">{simPct(champion)}</span>
    </div>
  );
}

/** Forecast strip F1 "Odds Time Machine" (server): the top-5 teams by current champion odds (plus
 *  the biggest since-kickoff faller pinned as a 6th row when not already in the top 5), each with a
 *  sparkline over the retained cond-steps, driven by one shared scrubber in the client island. Only
 *  the top-6 series are serialized to the client.
 *
 *  Fail-soft: history null or < 2 steps -> static current-% chips from the forecast alone (no
 *  scrubber, no sparklines); forecast AND history both empty -> nothing. */
export function OddsTimeMachine({
  teams,
  history,
  podium = null,
}: {
  teams: ForecastTeam[] | null;
  history: TitleOddsHistory | null;
  /** The settled podium (champion, runner-up, third, fourth) when the tournament is over. When all four
   *  are present the DEFAULT shown set is the podium - the teams that actually finished 1st..4th - not
   *  the current-odds order (which, once settled, collapses to champion-then-alphabetical). Null pre-
   *  settlement -> the live top-contenders + biggest-faller default. */
  podium?: string[] | null;
}) {
  // The retained cond-steps (x-axis = matchesPlayed). Every series is gap-free per the data
  // contract, but values are re-keyed by matchesPlayed below so a short series can never shift.
  const steps =
    history && history.series.length > 0
      ? history.series[0].points.map((p) => p.matchesPlayed)
      : [];

  if (history && steps.length >= 2) {
    const byTeam = new Map<string, Map<number, number>>(
      history.series.map((s) => [s.team, new Map(s.points.map((p) => [p.matchesPlayed, p.champion]))]),
    );
    const valuesFor = (team: string): number[] => {
      const m = byTeam.get(team);
      return steps.map((mp) => m?.get(mp) ?? 0);
    };
    const lastOf = (vals: number[]) => vals[vals.length - 1] ?? 0;

    // Top 5 by CURRENT champion odds: the forecast rows are already champion-desc; fall back to the
    // history's last step when the forecast read failed on its own.
    const top5: string[] =
      teams && teams.length > 0
        ? teams.slice(0, 5).map((t) => t.team)
        : [...byTeam.keys()]
            .sort((a, b) => lastOf(valuesFor(b)) - lastOf(valuesFor(a)))
            .slice(0, 5);

    // Biggest since-kickoff faller (last - first, most negative), pinned as the 6th default row if not
    // already in the top 5. This is the "look how far X fell" line kept visible out of the box.
    let faller: string | null = null;
    let worst = 0;
    for (const team of byTeam.keys()) {
      const vals = valuesFor(team);
      const d = lastOf(vals) - (vals[0] ?? 0);
      if (d < worst) {
        worst = d;
        faller = team;
      }
    }

    // The LIVE fallback default (used pre-settlement or if the podium is incomplete): the top-5
    // contenders plus the biggest faller (mirrors the prior strip).
    const liveDefault = top5.filter((t) => byTeam.has(t));
    if (faller && byTeam.has(faller) && !liveDefault.includes(faller)) {
      liveDefault.push(faller);
    }

    // The DEFAULT shown set. Settled: the four podium sides (read from the M104/M103 results, NOT the
    // odds table - once settled the table order is champion-then-alphabetical, the degenerate ordering
    // already fixed elsewhere). Pre-settlement / incomplete podium: the live fallback above.
    const defaultSelected = pickDefaultSelection(podium, liveDefault, (t) => byTeam.has(t));

    // Serialize ALL teams (all 48) so the client search can find any nation, not just a top-N rail.
    // Order: the default set first (so it leads the chip row + the shown order), then every other team
    // by CURRENT champion odds descending (relevance, never alphabetical), so the rail reads sensibly.
    const ordered: string[] = [];
    const pushTeam = (t: string) => {
      if (byTeam.has(t) && !ordered.includes(t)) ordered.push(t);
    };
    defaultSelected.forEach(pushTeam);
    [...byTeam.keys()]
      .sort((a, b) => lastOf(valuesFor(b)) - lastOf(valuesFor(a)))
      .forEach(pushTeam);
    const rows: TimeMachineRow[] = ordered.map((team) => ({ team, values: valuesFor(team) }));

    if (rows.length > 0) {
      return (
        <OddsTimeMachineClient
          rows={rows}
          steps={steps}
          totalMatches={history.totalMatches}
          defaultSelected={defaultSelected}
        />
      );
    }
  }

  // No usable history: static current-% chips from the forecast alone.
  if (teams && teams.length > 0) {
    return (
      <div className="mb-6">
        <LiveStrip ariaLabel="Current title odds" marker="forecast-time-machine">
          {teams.slice(0, 5).map((t) => (
            <StaticOddsChip key={t.team} team={t.team} champion={t.champion} />
          ))}
        </LiveStrip>
      </div>
    );
  }

  return null;
}

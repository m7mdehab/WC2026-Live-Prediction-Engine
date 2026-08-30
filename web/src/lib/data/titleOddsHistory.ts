import "server-only";
import { publicClient } from "@/lib/supabase/public";
import { cachedRead, TAGS } from "@/lib/data/cache";
import { selectAll } from "@/lib/data/paginate";
import type { ModelPredictionRun, TeamProbabilities } from "@/lib/types";

// Total tournament matches, kickoff to final. The champion is decided at the final (match 104), so
// the trajectory x-axis spans matches-played 0 (kickoff) to 104 (final). The current point sits at
// the latest run's conditioned_on_results, partway along (today ~17/104).
export const TOTAL_MATCHES = 104;

/** One point on a team's champion-probability trajectory. `matchesPlayed` = the run's
 *  conditioned_on_results (completed matches folded in); `x` is its normalized axis position. */
export interface TitleOddsPoint {
  matchesPlayed: number;
  x: number; // matchesPlayed / totalMatches, in [0,1]
  champion: number; // champion probability in [0,1]
}

/** A team's champion-probability series across the retained runs, oldest step first. */
export interface TitleOddsSeries {
  team: string;
  points: TitleOddsPoint[];
}

export interface TitleOddsHistory {
  /** The "now" position = the latest run's matches-played (current_run.conditioned_on_results). */
  currentMatchesPlayed: number;
  totalMatches: number;
  /** One series per team (all 48). Each series is ordered, gap-free (one point per retained step),
   *  and dup-free; champion probabilities across teams sum to ~1 at each step. */
  series: TitleOddsSeries[];
}

type RunRow = Pick<ModelPredictionRun, "run_id" | "created_at" | "conditioned_on_results">;
type TeamProbRow = Pick<TeamProbabilities, "run_id" | "team" | "champion">;

/** PURE assembly: turn retained runs + their champion probabilities into one ordered, gap-free,
 *  dup-free trajectory per team. Separated from the IO so it is deterministic and unit-testable.
 *
 *  Dedup rule: one run per distinct conditioned_on_results, the LATEST by created_at (the freshest,
 *  canonical run at that step). This drops any non-canonical same-cond rerun superseded by a later
 *  recalc at the same step. The team/match model is frozen since kickoff and deterministic at seed
 *  42, so canonical same-cond runs are byte-identical and the latest is a safe representative. The
 *  pre-baseline cond -1 forecast is dropped; the series anchors at cond0, the frozen kickoff
 *  baseline (current_run never points below it). */
export function assembleTitleOddsHistory(
  runs: RunRow[],
  tpRows: TeamProbRow[],
  totalMatches: number = TOTAL_MATCHES
): TitleOddsHistory {
  // Sort runs created_at-ascending so a later same-cond run overwrites the earlier id (last wins).
  const sortedRuns = [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latestPerCond = new Map<number, string>();
  for (const r of sortedRuns) {
    if (r.conditioned_on_results < 0) continue; // drop the pre-baseline cond -1 forecast
    latestPerCond.set(r.conditioned_on_results, r.run_id);
  }
  const steps = [...latestPerCond.entries()].sort((a, b) => a[0] - b[0]); // [cond, run_id], asc cond
  if (steps.length === 0) {
    return { currentMatchesPlayed: 0, totalMatches, series: [] };
  }

  const keptRunIds = new Set(steps.map(([, id]) => id));
  const champByRun = new Map<string, Map<string, number>>();
  for (const row of tpRows) {
    if (!keptRunIds.has(row.run_id)) continue;
    let m = champByRun.get(row.run_id);
    if (!m) champByRun.set(row.run_id, (m = new Map()));
    m.set(row.team, row.champion ?? 0);
  }

  // Every team that appears in any kept step (covers all 48; an eliminated team's champion naturally
  // trends to ~0 and that movement is carried through here).
  const teams = new Set<string>();
  for (const m of champByRun.values()) for (const t of m.keys()) teams.add(t);

  const series: TitleOddsSeries[] = [...teams]
    .sort((a, b) => a.localeCompare(b))
    .map((team) => ({
      team,
      points: steps.map(([cond, runId]) => ({
        matchesPlayed: cond,
        x: totalMatches > 0 ? cond / totalMatches : 0,
        champion: champByRun.get(runId)?.get(team) ?? 0,
      })),
    }));

  return {
    currentMatchesPlayed: steps[steps.length - 1][0],
    totalMatches,
    series,
  };
}

/** Uncached read: fetch the retained runs + their team champion probabilities and assemble the
 *  trajectory. Read-only; no recalc change, no new table, no backfill. */
export async function fetchTitleOddsHistory(): Promise<TitleOddsHistory> {
  const sb = publicClient();

  // model_prediction_runs grows one row per recalc cycle (every idle hour too), so it crosses the
  // PostgREST 1000-row cap mid-tournament. An unpaginated ascending read would silently drop the
  // NEWEST runs (the tail past row 1000) and freeze the chart at a stale step, so page the whole table
  // via selectAll. Order by run_id (unique) for stable pages; assembleTitleOddsHistory re-sorts by
  // created_at, so the fetch order does not affect the assembled result.
  const runs = await selectAll<RunRow>(
    sb,
    "model_prediction_runs",
    "run_id, created_at, conditioned_on_results",
    (q) => q.order("run_id", { ascending: true }),
  );

  // Keep only the canonical (latest) run per cond before fetching probabilities - fewer rows, and it
  // is the exact set assembleTitleOddsHistory will retain.
  const latestPerCond = new Map<number, string>();
  for (const r of runs) {
    if (r.conditioned_on_results < 0) continue;
    latestPerCond.set(r.conditioned_on_results, r.run_id);
  }
  const keptRunIds = [...latestPerCond.values()];
  if (keptRunIds.length === 0) {
    return { currentMatchesPlayed: 0, totalMatches: TOTAL_MATCHES, series: [] };
  }

  // Page through team_probabilities so we never hit PostgREST's default row cap (1000). By the end of
  // the tournament this is up to ~104 kept runs x 48 teams (~5000 rows) - a single unranged select
  // would silently truncate the oldest steps and drop the cond0 kickoff anchor. Order by run_id so
  // the pages are stable; assembly does its own sort/keying so page order does not matter.
  const PAGE = 1000;
  const tpRows: TeamProbRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("team_probabilities")
      .select("run_id, team, champion")
      .in("run_id", keptRunIds)
      .order("run_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as TeamProbRow[];
    tpRows.push(...page);
    if (page.length < PAGE) break;
  }

  return assembleTitleOddsHistory(runs, tpRows, TOTAL_MATCHES);
}

/** The real champion-probability trajectory for the title-odds-over-time chart, assembled from the
 *  RETAINED forecast history (Option A): every successful recalc kept its own model_prediction_runs
 *  row + team_probabilities, so we read them across runs rather than recomputing. Cache-tagged on
 *  the run version (busts on any new run/result). */
export function getTitleOddsHistory(): Promise<TitleOddsHistory> {
  return cachedRead("title-odds-history", [TAGS.run, TAGS.home], fetchTitleOddsHistory);
}

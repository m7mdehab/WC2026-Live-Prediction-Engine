import type { ModelPredictionRun, WinProbPoint } from "@/lib/types";

// Wave 1.4 - PURE assembly for one fixture's W/D/L over the retained forecast history. Kept free of
// "server-only" and any Supabase import so it is deterministic + unit-testable; the IO wrapper lives in
// winProbTrendFetch.ts. recalc writes a match_probabilities row for EVERY fixture on every run, but a
// finished match's probs are NULL from then on, so we DROP null-prob rows here: the series spans
// "first forecast -> last pre-kickoff run" and stops there ("frozen thereafter"). The final kept point
// is therefore the last real pre-kickoff forecast, which the finished-match pre-match view (Wave 1.5)
// relies on to pick the run whose factors/probs it backfills.

export type RunRow = Pick<ModelPredictionRun, "run_id" | "created_at" | "conditioned_on_results">;
export interface MpRow {
  run_id: string;
  p_team_a_win: number | null;
  p_draw: number | null;
  p_team_b_win: number | null;
}

/** Dedup to the canonical (latest by created_at) run per conditioned_on_results, drop the pre-baseline
 *  cond -1, order oldest->newest. Mirrors assembleTitleOddsHistory so the two over-time surfaces agree
 *  on which runs count. */
export function assembleWinProbTrend(runs: RunRow[], mpRows: MpRow[]): WinProbPoint[] {
  const mpByRun = new Map(mpRows.map((r) => [r.run_id, r]));
  const sortedRuns = [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latestPerCond = new Map<number, RunRow>();
  for (const r of sortedRuns) {
    if (r.conditioned_on_results < 0) continue; // drop the pre-baseline cond -1 forecast
    const mp = mpByRun.get(r.run_id);
    // recalc writes a row for a finished match too, but with NULL probs - drop those so the series
    // stops at the last REAL pre-kickoff forecast (and the final kept point is a valid pre-kickoff run).
    if (mp && mp.p_team_a_win != null && mp.p_draw != null && mp.p_team_b_win != null) {
      latestPerCond.set(r.conditioned_on_results, r); // last (latest) real-prob run per cond wins
    }
  }
  return [...latestPerCond.values()]
    .sort((a, b) => a.conditioned_on_results - b.conditioned_on_results)
    .map((r) => {
      const mp = mpByRun.get(r.run_id)!;
      return {
        run_id: r.run_id,
        created_at: r.created_at,
        p_team_a_win: mp.p_team_a_win,
        p_draw: mp.p_draw,
        p_team_b_win: mp.p_team_b_win,
      };
    });
}

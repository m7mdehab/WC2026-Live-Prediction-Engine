import "server-only";
import { publicClient } from "@/lib/supabase/public";
import { selectAll } from "@/lib/data/paginate";
import { assembleWinProbTrend, type RunRow, type MpRow } from "@/lib/data/winProbTrend";
import type { WinProbPoint } from "@/lib/types";

/** Uncached read: one fixture's W/D/L trend. Fetches only the runs this match appears in (via its
 *  match_probabilities rows), then their run metadata - so it never paginates the whole runs table per
 *  match page. Fail-soft to [] (selectAll degrades on error; the renderer hides an empty trend). */
export async function fetchWinProbTrend(matchId: string): Promise<WinProbPoint[]> {
  const sb = publicClient();
  // match_probabilities grows one row per (retained run, match); filtered to one match it is bounded by
  // the run count, which still crosses PostgREST's 1000-row cap late in the tournament, so page it.
  const mpRows = await selectAll<MpRow>(
    sb,
    "match_probabilities",
    "run_id, p_team_a_win, p_draw, p_team_b_win",
    (q) => q.eq("match_id", matchId).order("run_id", { ascending: true }),
  );
  if (mpRows.length === 0) return [];
  const runIds = [...new Set(mpRows.map((r) => r.run_id))];
  const runs = await selectAll<RunRow>(
    sb,
    "model_prediction_runs",
    "run_id, created_at, conditioned_on_results",
    (q) => q.in("run_id", runIds).order("run_id", { ascending: true }),
  );
  return assembleWinProbTrend(runs, mpRows);
}

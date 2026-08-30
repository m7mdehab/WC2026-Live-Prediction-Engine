// Server read for the /forecast resolved-stage badges. Gathers the three results-driven inputs -
// the retained per-stage probability HISTORY (for "was NN%"), the group standings (advance_group), and
// the knockout winner_team chain (KO rounds) - and runs the PURE assembler in lib/data/resolvedStages.
// Read-only; no recalc change, no new table. Fail-soft to {} so a bad read never blanks the forecast.
import "server-only";
import { publicClient } from "@/lib/supabase/public";
import { cachedRead, TAGS } from "@/lib/data/cache";
import { selectAll } from "@/lib/data/paginate";
import {
  buildGroupsData,
  type ConductEvent,
  type FixtureRow as GroupFixtureRow,
  type ResultRow as GroupResultRow,
  type TeamRow as GroupTeamRow,
} from "@/lib/data/groups";
import {
  advanceGroupVerdict,
  koRoundsFromCompleted,
  resolveTeamStages,
  teamFacts,
  type CompletedKoMatch,
  type StageKey,
  type StageResolution,
  type StageSeries,
  type Verdict,
} from "@/lib/data/resolvedStages";

/** team -> { stage -> resolution }. */
export type ResolvedStages = Record<string, Record<StageKey, StageResolution>>;

// KO fixture stage -> round index (R32=0 .. Final=4). third_place_playoff is NOT part of the champion
// ladder and is excluded.
const KO_ROUND: Record<string, number> = {
  round_of_32: 0,
  round_of_16: 1,
  quarter_finals: 2,
  semi_finals: 3,
  final: 4,
};
const KO_DB_STAGES = Object.keys(KO_ROUND);

const STAGE_COLS = "run_id, team, advance_group, reach_qf, reach_sf, reach_final, champion";

type RunRow = { run_id: string; created_at: string; conditioned_on_results: number };
type StageProbRow = {
  run_id: string;
  team: string;
  advance_group: number | null;
  reach_qf: number | null;
  reach_sf: number | null;
  reach_final: number | null;
  champion: number | null;
};

/** The retained per (team, stage) probability series, cond-ascending, mirroring titleOddsHistory's read
 *  pattern: paginate the runs, keep the canonical (latest created_at) run per conditioned_on_results,
 *  drop cond -1, then page team_probabilities for those runs and lay the 5 stage columns into per-team
 *  series ordered by the step (cond) sequence. */
async function fetchStageSeries(): Promise<{ seriesByTeam: Map<string, StageSeries>; teams: string[] }> {
  const sb = publicClient();
  const runs = await selectAll<RunRow>(
    sb,
    "model_prediction_runs",
    "run_id, created_at, conditioned_on_results",
    (q) => q.order("run_id", { ascending: true }),
  );

  // latest run per cond (drop cond -1): sort created_at asc so the last write per cond wins.
  const sorted = [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latestPerCond = new Map<number, string>();
  for (const r of sorted) {
    if (r.conditioned_on_results < 0) continue;
    latestPerCond.set(r.conditioned_on_results, r.run_id);
  }
  const steps = [...latestPerCond.entries()].sort((a, b) => a[0] - b[0]); // [cond, run_id], cond asc
  if (steps.length === 0) return { seriesByTeam: new Map(), teams: [] };
  const keptRunIds = steps.map(([, id]) => id);

  // page team_probabilities for the kept runs (>1000 rows by end of tournament), .in() is a filter.
  const PAGE = 1000;
  const rows: StageProbRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("team_probabilities")
      .select(STAGE_COLS)
      .in("run_id", keptRunIds)
      .order("run_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as StageProbRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const byRun = new Map<string, Map<string, StageProbRow>>();
  const teamSet = new Set<string>();
  for (const r of rows) {
    let m = byRun.get(r.run_id);
    if (!m) byRun.set(r.run_id, (m = new Map()));
    m.set(r.team, r);
    teamSet.add(r.team);
  }

  const teams = [...teamSet].sort((a, b) => a.localeCompare(b));
  const seriesByTeam = new Map<string, StageSeries>();
  const stageKeys: StageKey[] = ["advance_group", "reach_qf", "reach_sf", "reach_final", "champion"];
  for (const team of teams) {
    const series: StageSeries = { advance_group: [], reach_qf: [], reach_sf: [], reach_final: [], champion: [] };
    for (const [, runId] of steps) {
      const row = byRun.get(runId)?.get(team);
      for (const k of stageKeys) series[k].push((row?.[k] ?? 0) as number);
    }
    seriesByTeam.set(team, series);
  }
  return { seriesByTeam, teams };
}

/** advance_group verdict per team, from the group standings (top-2 / qualifying best-third). Reads via
 *  the COOKIE-FREE publicClient + the pure buildGroupsData engine (getGroupsData uses the cookie client,
 *  which cannot run inside the Data Cache) - so advance_group actually resolves. Projections are omitted:
 *  the projected order only matters when a group has NO results, in which case advance_group is
 *  in_progress regardless. Fail-soft to an empty map (every team then reads in_progress). */
async function fetchAdvanceGroupVerdicts(): Promise<Map<string, Verdict>> {
  const out = new Map<string, Verdict>();
  try {
    const sb = publicClient();
    const [tm, fx, res, ev] = await Promise.all([
      // scaling-guard-ok: teams is bounded by the tournament (48 rows, the qualified field)
      sb.from("teams").select("name, group_code, fifa_rank"),
      sb
        .from("fixtures")
        .select("match_id, match_no, group_code, team_a, team_b, kickoff_utc, city, country, status")
        .eq("stage", "group"),
      // scaling-guard-ok: match_results is bounded by the tournament (<=104 rows, one per match)
      sb.from("match_results").select("match_id, home_score, away_score, status"),
      // scaling-guard-ok: events is bounded by the tournament (cards/goals across <=104 matches)
      sb.from("events").select("match_id, team, player, event_type"),
    ]);
    if (tm.error) throw tm.error;
    if (fx.error) throw fx.error;
    if (res.error) throw res.error;
    const events = ev.error ? [] : ((ev.data ?? []) as ConductEvent[]);

    const groups = buildGroupsData(
      (tm.data ?? []) as GroupTeamRow[],
      (fx.data ?? []) as GroupFixtureRow[],
      (res.data ?? []) as GroupResultRow[],
      events,
      [],
    );
    const allGroupsFinal = groups.status === "final";
    const bestThirdQualifies = new Map<string, boolean>();
    for (const bt of groups.bestThirds) bestThirdQualifies.set(bt.team, bt.qualifies);
    for (const g of groups.groups) {
      const groupFinal = g.status === "final";
      for (const t of g.teams) {
        out.set(
          t.team,
          advanceGroupVerdict({
            groupFinal,
            rank: t.rank,
            allGroupsFinal,
            bestThirdQualifies: t.rank === 3 ? bestThirdQualifies.get(t.team) ?? false : null,
          }),
        );
      }
    }
  } catch (err) {
    console.error("resolvedStages: group standings read failed (advance_group -> in_progress):", err);
  }
  return out;
}

/** The completed knockout matches, normalized with their resolved participants (from the current run's
 *  projected_bracket) + winner_team + round index. Fail-soft to []. */
async function fetchCompletedKoMatches(): Promise<CompletedKoMatch[]> {
  try {
    const sb = publicClient();
    const { data: runs } = await sb.from("current_run").select("run_id").limit(1);
    const runId = (runs?.[0] as { run_id: string } | undefined)?.run_id ?? null;

    const [fx, mr, pb] = await Promise.all([
      sb.from("fixtures").select("match_id, stage").in("stage", KO_DB_STAGES),
      // scaling-guard-ok: match_results is bounded by the tournament (<=104 rows, one per match)
      sb.from("match_results").select("match_id, winner_team, status"),
      runId
        ? sb
            .from("projected_bracket")
            .select("match_id, team_a, team_b, a_resolved, b_resolved")
            .eq("run_id", runId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (fx.error) throw fx.error;
    if (mr.error) throw mr.error;
    if (pb.error) throw pb.error;

    const stageByMatch = new Map<string, string>();
    for (const f of (fx.data ?? []) as { match_id: string; stage: string }[]) stageByMatch.set(f.match_id, f.stage);

    const resultByMatch = new Map<string, { winner: string | null; status: string }>();
    for (const r of (mr.data ?? []) as { match_id: string; winner_team: string | null; status: string }[]) {
      resultByMatch.set(r.match_id, { winner: r.winner_team, status: r.status });
    }

    // resolved participants PER SIDE from the current run's projected bracket (a completed KO match has
    // both sides resolved to the real teams).
    const koResolved = new Map<string, { a: string | null; b: string | null }>();
    for (const r of (pb.data ?? []) as {
      match_id: string; team_a: string | null; team_b: string | null; a_resolved: boolean; b_resolved: boolean;
    }[]) {
      koResolved.set(r.match_id, { a: r.a_resolved ? r.team_a : null, b: r.b_resolved ? r.team_b : null });
    }

    const out: CompletedKoMatch[] = [];
    for (const [matchId, stage] of stageByMatch) {
      const round = KO_ROUND[stage];
      if (round === undefined) continue;
      const res = resultByMatch.get(matchId);
      if (!res || res.status !== "completed") continue; // only a recorded completed KO match resolves a stage
      const sides = koResolved.get(matchId) ?? { a: null, b: null };
      out.push({ round, teamA: sides.a, teamB: sides.b, winner: res.winner });
    }
    return out;
  } catch (err) {
    console.error("resolvedStages: knockout results read failed (KO stages -> in_progress):", err);
    return [];
  }
}

async function _getResolvedStagesUncached(): Promise<ResolvedStages> {
  try {
    const [{ seriesByTeam, teams }, advanceVerdicts, koMatches] = await Promise.all([
      fetchStageSeries(),
      fetchAdvanceGroupVerdicts(),
      fetchCompletedKoMatches(),
    ]);
    if (teams.length === 0) return {};

    const { wonRound, lostRound } = koRoundsFromCompleted(koMatches);

    const out: ResolvedStages = {};
    for (const team of teams) {
      const advanceGroup = advanceVerdicts.get(team) ?? "in_progress";
      const facts = teamFacts(team, advanceGroup, wonRound, lostRound);
      const series = seriesByTeam.get(team) ?? {
        advance_group: [], reach_qf: [], reach_sf: [], reach_final: [], champion: [],
      };
      out[team] = resolveTeamStages(facts, series);
    }
    return out;
  } catch (err) {
    console.error("Failed to assemble resolved stages:", err);
    return {};
  }
}

/** Per-team resolved-stage verdicts + "was NN%" for the /forecast badges, from the retained history +
 *  group standings + knockout winner chain. Cache-tagged on the run version. Fail-soft to {}. */
export function getResolvedStages(): Promise<ResolvedStages> {
  return cachedRead("resolved-stages", [TAGS.forecast, TAGS.run], _getResolvedStagesUncached);
}

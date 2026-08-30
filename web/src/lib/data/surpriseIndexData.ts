import "server-only";
import { publicClient } from "@/lib/supabase/public";
import { cachedRead, TAGS } from "@/lib/data/cache";
import { selectAll } from "@/lib/data/paginate";
import {
  overallStats, rankGroup, rankThirds,
  type MatchResultTuple, type OverallStat,
} from "@/lib/data/groups";
import {
  assembleSurprise, computeDeepestStages,
  type Cond0StageProbs, type MatchOutcome, type StageLevel,
  type SurpriseResult, type TeamResultsFacts,
} from "@/lib/data/surpriseIndex";

// Server read for the sticky surprise index (Wave 4). Gathers, from RESULTS only:
//   - the frozen cond0 team_probabilities (p0 per stage),
//   - the deepest stage each team ACTUALLY reached (group results -> R32 qualifiers; knockout
//     winner_team chain -> deeper stages),
//   - each team's per-match achieved-vs-expected points, where "expected" comes from the LAST
//     retained run recorded BEFORE that match kicked off (mirrors the W1 pre-kickoff rule),
// then calls the PURE assembler in lib/data/surpriseIndex. Growth-prone reads
// (model_prediction_runs, match_probabilities, projected_bracket) are paginated via selectAll, the
// same defence as lib/data/titleOddsHistory. Everything is fail-soft: any sub-read that errors
// degrades that team's match list to empty (stage surprise still scores); a hard failure returns null
// and the forecast page renders empty cards.

type TeamRow = { name: string; group_code: string; host_flag: boolean; fifa_rank: number | null };
type FixtureRow = {
  match_id: string; match_no: number; stage: string; group_code: string | null;
  team_a: string | null; team_b: string | null; kickoff_utc: string | null; status: string;
};
type ResultRow = { match_id: string; home_score: number; away_score: number; winner_team: string | null; status: string };
type Cond0Row = {
  team: string; advance_group: number | null; reach_r16: number | null; reach_qf: number | null;
  reach_sf: number | null; reach_final: number | null; champion: number | null;
};
type RunRow = { run_id: string; created_at: string; conditioned_on_results: number };
type MatchProbRow = { run_id: string; match_id: string; p_team_a_win: number | null; p_draw: number | null; p_team_b_win: number | null };
type BracketRow = { run_id: string; match_id: string; team_a: string | null; team_b: string | null; a_resolved: boolean; b_resolved: boolean };

/** Which teams qualified for the round of 32 by the ACTUAL completed group results: the top two of
 *  every fully-played group (FIFA Article 13 order, reusing lib/data/groups) plus the best 8 thirds.
 *  A group with any unplayed fixture contributes no qualifier yet (the knockout has not started). */
export function computeResultQualifiers(
  teams: TeamRow[],
  groupFixtures: FixtureRow[],
  completed: Map<string, { home: number; away: number }>,
): Set<string> {
  const teamsByGroup = new Map<string, string[]>();
  const fifaRank: Record<string, number | null> = {};
  for (const t of teams) {
    if (!teamsByGroup.has(t.group_code)) teamsByGroup.set(t.group_code, []);
    teamsByGroup.get(t.group_code)!.push(t.name);
    fifaRank[t.name] = t.fifa_rank;
  }
  const fxByGroup = new Map<string, FixtureRow[]>();
  for (const f of groupFixtures) {
    if (!f.group_code) continue;
    if (!fxByGroup.has(f.group_code)) fxByGroup.set(f.group_code, []);
    fxByGroup.get(f.group_code)!.push(f);
  }

  const qualified = new Set<string>();
  const thirds: string[] = [];
  const thirdOverall: Record<string, OverallStat> = {};

  for (const [code, gTeams] of teamsByGroup) {
    const fx = fxByGroup.get(code) ?? [];
    if (fx.length === 0) continue;
    const tuples: MatchResultTuple[] = [];
    for (const f of fx) {
      const r = completed.get(f.match_id);
      if (r && f.team_a && f.team_b) tuples.push([f.team_a, f.team_b, r.home, r.away]);
    }
    if (tuples.length < fx.length) continue; // group not complete -> no R32 qualifier yet
    const overall = overallStats(gTeams, tuples);
    const ordered = rankGroup(gTeams, { results: tuples, overall, conduct: {}, fifaRank });
    if (ordered[0]) qualified.add(ordered[0]);
    if (ordered[1]) qualified.add(ordered[1]);
    const third = ordered[2];
    if (third) { thirds.push(third); thirdOverall[third] = overall[third]; }
  }

  if (thirds.length > 0) {
    const thirdConduct: Record<string, number> = {};
    const thirdFifa: Record<string, number | null> = {};
    for (const t of thirds) { thirdConduct[t] = 0; thirdFifa[t] = fifaRank[t] ?? null; }
    const rankedThirds = rankThirds(thirds, thirdOverall, thirdConduct, thirdFifa);
    for (let i = 0; i < rankedThirds.length && i < 8; i++) qualified.add(rankedThirds[i]);
  }
  return qualified;
}

/** For each played match with a kickoff time, the run_id of the LAST retained run recorded strictly
 *  before that kickoff (greatest created_at < kickoff). Returns match_id -> run_id (only where one
 *  exists). Pure so the pre-kickoff selection is testable. */
export function preKickoffRunByMatch(
  runs: RunRow[],
  playedFixtures: { match_id: string; kickoff_utc: string | null }[],
): Map<string, string> {
  // retained runs (drop the pre-baseline cond -1 forecast), ascending by created_at
  const sorted = runs
    .filter((r) => r.conditioned_on_results >= 0)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const out = new Map<string, string>();
  for (const f of playedFixtures) {
    if (!f.kickoff_utc) continue;
    let chosen: string | null = null;
    for (const r of sorted) {
      if (r.created_at < f.kickoff_utc) chosen = r.run_id; // sorted asc -> last match wins
      else break;
    }
    if (chosen) out.set(f.match_id, chosen);
  }
  return out;
}

/** Points for a team given its scoreline in a match: win = 3, draw = 1, loss = 0. */
function pointsFor(own: number, opp: number): number {
  return own > opp ? 3 : own === opp ? 1 : 0;
}

async function fetchSurprise(): Promise<SurpriseResult | null> {
  const sb = publicClient();

  // 1) FROZEN cond0 run (earliest conditioned_on_results = 0, the immutable hijack-proof anchor).
  const baseRun = await sb
    .from("model_prediction_runs").select("run_id")
    .eq("conditioned_on_results", 0).order("created_at", { ascending: true }).limit(1);
  if (baseRun.error) throw baseRun.error;
  const cond0RunId = (baseRun.data?.[0] as { run_id: string } | undefined)?.run_id ?? null;
  if (!cond0RunId) return null;

  // 2) cond0 team_probabilities -> p0 map (run-filtered: bounded to 48 rows). This is also where the
  //    ELIGIBILITY GATE gets its inputs: the frozen cond0 `champion` odds define the elite tier, with
  //    `reach_final` as the first deterministic tie-break (assembleSurprise reads both off this map, and
  //    the FIFA rank / team name off the facts below).
  const cp = await sb
    .from("team_probabilities")
    .select("team, advance_group, reach_r16, reach_qf, reach_sf, reach_final, champion")
    .eq("run_id", cond0RunId);
  if (cp.error) throw cp.error;
  const cond0 = new Map<string, Cond0StageProbs>();
  for (const r of (cp.data ?? []) as Cond0Row[]) {
    cond0.set(r.team, {
      advance_group: r.advance_group, reach_r16: r.reach_r16, reach_qf: r.reach_qf,
      reach_sf: r.reach_sf, reach_final: r.reach_final, champion: r.champion,
    });
  }

  // 3) teams + fixtures + results (all tournament-bounded).
  const [tm, fx, mr] = await Promise.all([
    // scaling-guard-ok: teams is bounded by the tournament (48 rows, the qualified field)
    sb.from("teams").select("name, group_code, host_flag, fifa_rank"),
    // scaling-guard-ok: fixtures is bounded by the tournament (<=104 rows, one per match)
    sb.from("fixtures").select("match_id, match_no, stage, group_code, team_a, team_b, kickoff_utc, status"),
    // scaling-guard-ok: match_results is bounded by the tournament (<=104 rows, one per match)
    sb.from("match_results").select("match_id, home_score, away_score, winner_team, status"),
  ]);
  if (tm.error) throw tm.error;
  if (fx.error) throw fx.error;
  if (mr.error) throw mr.error;

  const teams = (tm.data ?? []) as TeamRow[];
  const fixtures = (fx.data ?? []) as FixtureRow[];
  const allTeams = teams.map((t) => t.name);
  const fixtureById = new Map(fixtures.map((f) => [f.match_id, f]));

  const completed = new Map<string, { home: number; away: number; winner: string | null }>();
  for (const r of (mr.data ?? []) as ResultRow[]) {
    if (r.status === "completed") completed.set(r.match_id, { home: r.home_score, away: r.away_score, winner: r.winner_team });
  }

  // 3a) deepest stage reached (group qualifiers -> R32; knockout winner_team chain -> deeper).
  const groupFixtures = fixtures.filter((f) => f.stage === "group");
  const completedScores = new Map<string, { home: number; away: number }>();
  for (const [id, r] of completed) completedScores.set(id, { home: r.home, away: r.away });
  const qualifiedR32 = computeResultQualifiers(teams, groupFixtures, completedScores);

  const koWinnersByStage = new Map<string, Set<string>>();
  for (const [id, r] of completed) {
    const f = fixtureById.get(id);
    if (!f || f.stage === "group" || !r.winner) continue;
    if (!koWinnersByStage.has(f.stage)) koWinnersByStage.set(f.stage, new Set());
    koWinnersByStage.get(f.stage)!.add(r.winner);
  }
  const deepest = computeDeepestStages(allTeams, qualifiedR32, koWinnersByStage);

  // 4) per-match achieved-vs-expected points (best-effort; fail-soft to empty).
  const matchesByTeam = new Map<string, MatchOutcome[]>();
  try {
    const playedFixtures = [...completed.keys()]
      .map((id) => fixtureById.get(id))
      .filter((f): f is FixtureRow => !!f && !!f.kickoff_utc);

    if (playedFixtures.length > 0) {
      // retained runs (paginated: model_prediction_runs grows one row per recalc cycle).
      const runs = await selectAll<RunRow>(
        sb, "model_prediction_runs", "run_id, created_at, conditioned_on_results",
        (q) => q.order("run_id", { ascending: true }),
      );
      const preRunByMatch = preKickoffRunByMatch(runs, playedFixtures);
      const neededRunIds = [...new Set(preRunByMatch.values())];
      const playedIds = playedFixtures.map((f) => f.match_id);

      if (neededRunIds.length > 0) {
        // match_probabilities + projected_bracket for exactly the needed (run, match) pairs. Both are
        // .in-filtered AND paginated (up to ~#matches runs x 104 matches would cross the 1000 cap).
        const [mprobs, brk] = await Promise.all([
          selectAll<MatchProbRow>(
            sb, "match_probabilities", "run_id, match_id, p_team_a_win, p_draw, p_team_b_win",
            (q) => q.in("run_id", neededRunIds).in("match_id", playedIds),
          ),
          selectAll<BracketRow>(
            sb, "projected_bracket", "run_id, match_id, team_a, team_b, a_resolved, b_resolved",
            (q) => q.in("run_id", neededRunIds).in("match_id", playedIds),
          ),
        ]);
        const probKey = (rid: string, mid: string) => `${rid}|${mid}`;
        const probByRunMatch = new Map(mprobs.map((p) => [probKey(p.run_id, p.match_id), p]));
        const brkByRunMatch = new Map(brk.map((b) => [probKey(b.run_id, b.match_id), b]));

        const push = (team: string, o: MatchOutcome) => {
          if (!matchesByTeam.has(team)) matchesByTeam.set(team, []);
          matchesByTeam.get(team)!.push(o);
        };

        for (const f of playedFixtures) {
          const res = completed.get(f.match_id)!;
          const runId = preRunByMatch.get(f.match_id);
          if (!runId) continue;
          const prob = probByRunMatch.get(probKey(runId, f.match_id));
          if (!prob) continue;

          // orient the two sides. Group: fixture team_a/team_b. Knockout: the pre-kickoff run's
          // resolved bracket sides (fixtures keep KO team_a/team_b NULL until the feeder resolves).
          let sideA = f.team_a, sideB = f.team_b;
          if (f.stage !== "group" && (!sideA || !sideB)) {
            const b = brkByRunMatch.get(probKey(runId, f.match_id));
            if (b && b.a_resolved && b.b_resolved && b.team_a && b.team_b) { sideA = b.team_a; sideB = b.team_b; }
          }
          if (!sideA || !sideB) continue; // cannot orient pre-kickoff -> skip (documented)

          const pWinA = prob.p_team_a_win ?? 0, pDraw = prob.p_draw ?? 0, pWinB = prob.p_team_b_win ?? 0;
          push(sideA, { achievedPoints: pointsFor(res.home, res.away), expectedPoints: 3 * pWinA + pDraw });
          push(sideB, { achievedPoints: pointsFor(res.away, res.home), expectedPoints: 3 * pWinB + pDraw });
        }
      }
    }
  } catch (err) {
    console.error("surpriseIndex: pre-kickoff match-surprise read failed (stage surprise still scored):", err);
    matchesByTeam.clear();
  }

  const facts: TeamResultsFacts[] = teams.map((t) => ({
    team: t.name,
    hostFlag: t.host_flag,
    fifaRank: t.fifa_rank,
    deepestStage: (deepest.get(t.name) ?? "group") as StageLevel,
    matches: matchesByTeam.get(t.name) ?? [],
  }));

  return assembleSurprise(facts, cond0);
}

/** The sticky surprise index for the current results: scored teams + the dark-horse and overvalued
 *  cards. Returns null when no cond0 run exists. Cache-tagged on run + forecast (busts on any new
 *  run or recorded result). */
export function getSurpriseIndex(): Promise<SurpriseResult | null> {
  return cachedRead("surprise-index", [TAGS.forecast, TAGS.run], fetchSurprise);
}

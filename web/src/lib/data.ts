import "server-only";
import { publicClient } from "@/lib/supabase/public";
import { cachedRead, TAGS } from "@/lib/data/cache";
import { preMatchdayRun } from "@/lib/data/daily";
import { nextMatchday } from "@/lib/data/dailyAuto";
import { teamElo } from "@/lib/teamElo";
import type {
  CurrentForecast, Fixture, GroupSnapshot, ModelPredictionRun,
  Team, TeamProbabilities, MatchProbabilities,
  MatchFactorsRow, UpcomingMatch, ChampionContext,
  BracketMatchRow, BracketMatch, ProjectedBracket,
  GroupStandingRow, GroupProjection, GroupTableTeam,
} from "@/lib/types";

// /matches reads live in lib/data/matches.ts (pure move); re-exported here for import stability.
export { getMatchList, getMatchDetail } from "@/lib/data/matches";

/** The forecast the public currently sees: latest run (current_run view) + its probabilities. */
export async function getCurrentForecast(): Promise<CurrentForecast | null> {
  const sb = publicClient(); // C1: cookie-free public read (was the cookie-bound server client, which forced every consumer route dynamic)
  const { data: runs, error } = await sb.from("current_run").select("*").limit(1);
  if (error) throw error;
  const run = runs?.[0] as ModelPredictionRun | undefined;
  if (!run) return null;

  const [tp, mp] = await Promise.all([
    sb.from("team_probabilities").select("*").eq("run_id", run.run_id),
    sb.from("match_probabilities").select("*").eq("run_id", run.run_id),
  ]);
  if (tp.error) throw tp.error;
  if (mp.error) throw mp.error;
  return {
    run,
    teamProbabilities: (tp.data ?? []) as TeamProbabilities[],
    matchProbabilities: (mp.data ?? []) as MatchProbabilities[],
  };
}

/** One title-race row. `prevRank`/`prevChampion` are the team's rank and champion probability in
 *  the run that was current before the current matchday's first kickoff (the SAME pre-day run the
 *  daily briefing recaps against; "current matchday" = the earliest date with an unfinished
 *  fixture, dailyAuto.nextMatchday). null when no such run exists → no-delta fallback render. */
export interface TitleRaceRow {
  team: string;
  champion: number;
  reachFinal: number | null;
  prevRank: number | null;
  prevChampion: number | null;
}

export interface HomeData {
  run: ModelPredictionRun | null;
  /** Top teams by title probability (champion desc). */
  leaderboard: TitleRaceRow[];
  champion: ChampionContext | null;
  /** A lookahead window of upcoming fixtures (the home widget renders whole days from these). */
  upcoming: UpcomingMatch[];
  /** Total scheduled group fixtures with both teams set - used to decide the "View all" link. */
  upcomingTotal: number;
}

/** Everything the desktop home needs, in one parallel round-trip against the current run.
 *  Cached by data-version (run id + results fingerprint); recomputes instantly on any result/run. */
export function getHomeData(
  opts: { leaderboardSize?: number; upcomingLimit?: number } = {}
): Promise<HomeData> {
  const { leaderboardSize = 8, upcomingLimit = 16 } = opts;
  return cachedRead(`home:${leaderboardSize}:${upcomingLimit}`, [TAGS.home, TAGS.run], () =>
    _getHomeDataUncached(leaderboardSize, upcomingLimit)
  );
}

async function _getHomeDataUncached(leaderboardSize: number, upcomingLimit: number): Promise<HomeData> {
  const sb = publicClient();

  const { data: runs, error: runErr } = await sb.from("current_run").select("*").limit(1);
  if (runErr) throw runErr;
  const run = (runs?.[0] as ModelPredictionRun | undefined) ?? null;
  if (!run) return { run: null, leaderboard: [], champion: null, upcoming: [], upcomingTotal: 0 };

  const [tp, mp, mf, fx, mr, pb] = await Promise.all([
    sb.from("team_probabilities").select("*").eq("run_id", run.run_id),
    sb.from("match_probabilities").select("*").eq("run_id", run.run_id),
    sb.from("match_factors").select("run_id, match_id, factors").eq("run_id", run.run_id),
    // ALL stages: the title-race movement needs the whole calendar for the matchday rule;
    // the upcoming widget filters back down to group fixtures below.
    // scaling-guard-ok: fixtures is bounded by the tournament (<=104 rows, the full match calendar)
    sb.from("fixtures").select("*").order("match_no"),
    // scaling-guard-ok: match_results is bounded by the tournament (<=104 rows, one per match)
    sb.from("match_results").select("match_id, status"),
    // TRACK 1: the projected bracket carries the RESOLVED knockout participants (per-side fill). The
    // upcoming widget falls back to the next scheduled KO round once the group stage runs dry, so it
    // is never empty mid-tournament. scaling-guard-ok: <=32 KO rows, bounded by the tournament.
    sb.from("projected_bracket").select("match_id, team_a, team_b, a_resolved, b_resolved").eq("run_id", run.run_id),
  ]);
  for (const r of [tp, mp, mf, fx, mr, pb]) if (r.error) throw r.error;

  const teamProbs = (tp.data ?? []) as TeamProbabilities[];
  const matchProbs = new Map<string, MatchProbabilities>(
    ((mp.data ?? []) as MatchProbabilities[]).map((m) => [m.match_id, m])
  );
  const factors = new Map<string, MatchFactorsRow["factors"]>(
    ((mf.data ?? []) as MatchFactorsRow[]).map((m) => [m.match_id, m.factors])
  );
  const allFixtures = (fx.data ?? []) as Fixture[];
  const fixtures = allFixtures.filter((f) => f.stage === "group");

  // ---- title-race movement: current run vs the pre-matchday run --------------------------------
  // "Current matchday" = the earliest date with an unfinished fixture (dailyAuto.nextMatchday -
  // the same rollover rule /daily uses). The reference run is the one that was current strictly
  // before that day's first kickoff (daily.preMatchdayRun - the same selection the briefing's
  // recap uses). Any failure here degrades to null deltas (the honest no-movement fallback).
  let prevRankByTeam: Map<string, number> | null = null;
  let prevChampByTeam: Map<string, number | null> | null = null;
  try {
    // Only status='completed' counts as a recorded result (mirrors lib/data/daily.ts).
    const completed = new Set(
      ((mr.data ?? []) as { match_id: string; status: string }[])
        .filter((r) => r.status === "completed")
        .map((r) => r.match_id)
    );
    const dayMap = new Map<string, { matchCount: number; finishedCount: number }>();
    for (const f of allFixtures) {
      const d = f.kickoff_utc?.slice(0, 10);
      if (!d) continue;
      const e = dayMap.get(d) ?? { matchCount: 0, finishedCount: 0 };
      e.matchCount += 1;
      if (completed.has(f.match_id) || f.status === "completed") e.finishedCount += 1;
      dayMap.set(d, e);
    }
    const { next } = nextMatchday(
      [...dayMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({ date, ...v }))
    );
    const firstKickoff = next
      ? allFixtures
          .filter((f) => f.kickoff_utc?.startsWith(next))
          .map((f) => f.kickoff_utc as string)
          .sort()[0] ?? null
      : null;
    const pre = firstKickoff ? await preMatchdayRun(sb, firstKickoff) : null;
    if (pre) {
      let prevProbs: { team: string; champion: number | null }[];
      if (pre.run_id === run.run_id) {
        prevProbs = teamProbs; // model hasn't rerun since the matchday started → zero deltas
      } else {
        const { data, error } = await sb
          .from("team_probabilities").select("team, champion").eq("run_id", pre.run_id);
        if (error) throw error;
        prevProbs = (data ?? []) as { team: string; champion: number | null }[];
      }
      const rankedPrev = [...prevProbs].sort((a, b) => (b.champion ?? 0) - (a.champion ?? 0));
      prevRankByTeam = new Map(rankedPrev.map((t, i) => [t.team, i + 1]));
      prevChampByTeam = new Map(rankedPrev.map((t) => [t.team, t.champion]));
    }
  } catch {
    /* movement unavailable → leaderboard renders the no-delta fallback */
  }

  const ranked = [...teamProbs].sort((a, b) => (b.champion ?? 0) - (a.champion ?? 0));
  const leaderboard = ranked.slice(0, leaderboardSize).map((t) => ({
    team: t.team,
    champion: t.champion ?? 0,
    reachFinal: t.reach_final,
    prevRank: prevRankByTeam?.get(t.team) ?? null,
    prevChampion: prevChampByTeam ? prevChampByTeam.get(t.team) ?? null : null,
  }));

  // Champion context: the real facts behind the top pick, pulled from any match it appears in.
  let champion: ChampionContext | null = null;
  const top = ranked[0];
  if (top) {
    let fifaRank: number | null = null;
    let elo: number | null = null;
    let form: ChampionContext["form"] = [];
    for (const f of factors.values()) {
      if (!f) continue;
      const side = f.team_a === top.team ? "team_a" : f.team_b === top.team ? "team_b" : null;
      if (!side) continue;
      fifaRank = f.fifa_rank[side];
      elo = side === "team_a" ? f.rating_gap.elo_a : f.rating_gap.elo_b;
      form = f.recent_form[side] ?? [];
      break;
    }
    champion = {
      team: top.team,
      champion: top.champion ?? 0,
      reachFinal: top.reach_final,
      fifaRank,
      elo,
      form,
    };
  }

  // Upcoming: scheduled group fixtures with both teams set, soonest first.
  const byKickoff = (a: { kickoff_utc: string | null; match_no: number },
                     b: { kickoff_utc: string | null; match_no: number }) => {
    const ka = a.kickoff_utc ?? "";
    const kb = b.kickoff_utc ?? "";
    return ka === kb ? a.match_no - b.match_no : ka.localeCompare(kb);
  };
  const scheduled = fixtures
    .filter((f) => f.status === "scheduled" && f.team_a && f.team_b)
    .sort(byKickoff);

  // TRACK 1: the upcoming card must NOT show "No upcoming matches scheduled" while the tournament is
  // live. Once the group stage is exhausted (no scheduled group fixtures remain), fall back to the
  // next scheduled KNOCKOUT fixtures whose participants are RESOLVED in the projected bracket
  // (a_resolved && b_resolved -> a real, played-into fixture). Knockout fixtures whose teams are not
  // yet resolved (slot codes / NULL in the fixtures table) are deliberately excluded: the widget
  // only surfaces real, tappable matchups, and the next decided round flows in as feeders resolve.
  let upcomingSource = scheduled;
  if (scheduled.length === 0) {
    const resolvedKo = new Map<string, { team_a: string; team_b: string }>();
    for (const r of (pb.data ?? []) as {
      match_id: string; team_a: string | null; team_b: string | null;
      a_resolved: boolean; b_resolved: boolean;
    }[]) {
      if (r.a_resolved && r.b_resolved && r.team_a && r.team_b) {
        resolvedKo.set(r.match_id, { team_a: r.team_a, team_b: r.team_b });
      }
    }
    const completed = new Set(
      ((mr.data ?? []) as { match_id: string; status: string }[])
        .filter((r) => r.status === "completed")
        .map((r) => r.match_id)
    );
    upcomingSource = allFixtures
      .filter((f) => f.stage !== "group" && resolvedKo.has(f.match_id) && !completed.has(f.match_id))
      .map((f) => {
        const ko = resolvedKo.get(f.match_id)!;
        return { ...f, team_a: ko.team_a, team_b: ko.team_b } as Fixture;
      })
      .sort(byKickoff);
  }

  const upcoming: UpcomingMatch[] = upcomingSource.slice(0, upcomingLimit).map((f) => ({
    match_id: f.match_id,
    match_no: f.match_no,
    team_a: f.team_a as string,
    team_b: f.team_b as string,
    city: f.city,
    country: f.country,
    kickoff_utc: f.kickoff_utc,
    probs: matchProbs.get(f.match_id) ?? null,
    factors: factors.get(f.match_id) ?? null,
  }));

  return { run, leaderboard, champion, upcoming, upcomingTotal: upcomingSource.length };
}

/** The projected knockout bracket for the current run, joined with fixture venue/date. Cached. */
export function getProjectedBracket(): Promise<ProjectedBracket | null> {
  return cachedRead("projected-bracket", [TAGS.bracket, TAGS.forecast, TAGS.run], _getProjectedBracketUncached);
}

async function _getProjectedBracketUncached(): Promise<ProjectedBracket | null> {
  const sb = publicClient();
  const { data: runs, error } = await sb.from("current_run").select("*").limit(1);
  if (error) throw error;
  const run = (runs?.[0] as ModelPredictionRun | undefined) ?? null;
  if (!run) return null;

  const [pb, fx] = await Promise.all([
    sb.from("projected_bracket").select("*").eq("run_id", run.run_id),
    // scaling-guard-ok: fixtures is bounded by the tournament (<=104 rows, the full match calendar)
    sb.from("fixtures").select("match_id, venue, city, country, kickoff_utc"),
  ]);
  if (pb.error) throw pb.error;
  if (fx.error) throw fx.error;

  const venueByMatch = new Map(
    ((fx.data ?? []) as Pick<Fixture, "match_id" | "venue" | "city" | "country" | "kickoff_utc">[])
      .map((f) => [f.match_id, f])
  );

  const matches: Record<string, BracketMatch> = {};
  for (const r of (pb.data ?? []) as BracketMatchRow[]) {
    const v = venueByMatch.get(r.match_id);
    matches[r.match_id] = {
      ...r,
      venue: v?.venue ?? null,
      city: v?.city ?? null,
      country: v?.country ?? null,
      kickoff_utc: v?.kickoff_utc ?? null,
    };
  }
  const champion = matches["M104"]?.proj_winner ?? null;
  return { run, champion, matches };
}

/** The PRE-TOURNAMENT (conditioned_on_results = 0) projected bracket: the model's FROZEN, immutable
 *  reference - the same locked cond0 baseline the forecast delta uses (getGroupProjections). The
 *  /ai-vs-humans page scores the model's COMPETITOR bracket against actuals using THIS bracket (the
 *  one the model "would have submitted" before kickoff), so the live re-projection can never give the
 *  model foresight. The cond0 run is immutable, so the bracket is naturally frozen. Anchored to the
 *  EARLIEST cond0 run (see _getPreTournamentBracketUncached) so a later cond0 row can never hijack it.
 *  Null if no cond0 run exists; the caller then DROPS the model competitor and shows a visible
 *  "pre-tournament bracket unavailable" state (never the live foresight bracket). Cached. */
export function getPreTournamentBracket(): Promise<ProjectedBracket | null> {
  return cachedRead("pretournament-bracket", [TAGS.bracket, TAGS.forecast, TAGS.run], _getPreTournamentBracketUncached);
}

async function _getPreTournamentBracketUncached(): Promise<ProjectedBracket | null> {
  const sb = publicClient();
  // CANONICAL ANCHOR RULE: the EARLIEST conditioned_on_results = 0 run by created_at (ascending, limit
  // 1). The first cond0 run ever recorded is the one the model committed before kickoff; that row is
  // immutable and, because it is the earliest, NO later cond0 row can ever displace it. This is the
  // deterministic, hijack-proof choice: a stray POST-kickoff cond0 row (e.g. a WC2022 backtest run that
  // shares model_prediction_runs, or any re-run) is necessarily NEWER, so it can never become the
  // frozen bracket and can never move the model's score mid-tournament. (Selecting the NEWEST cond0 -
  // the previous behaviour - was the hijack risk this rule removes.)
  const baseRun = await sb
    .from("model_prediction_runs").select("*")
    .eq("conditioned_on_results", 0).order("created_at", { ascending: true }).limit(1);
  if (baseRun.error) throw baseRun.error;
  const run = (baseRun.data?.[0] as ModelPredictionRun | undefined) ?? null;
  if (!run) return null;

  const [pb, fx] = await Promise.all([
    sb.from("projected_bracket").select("*").eq("run_id", run.run_id),
    // scaling-guard-ok: fixtures is bounded by the tournament (<=104 rows, the full match calendar)
    sb.from("fixtures").select("match_id, venue, city, country, kickoff_utc"),
  ]);
  if (pb.error) throw pb.error;
  if (fx.error) throw fx.error;

  const venueByMatch = new Map(
    ((fx.data ?? []) as Pick<Fixture, "match_id" | "venue" | "city" | "country" | "kickoff_utc">[])
      .map((f) => [f.match_id, f])
  );

  const matches: Record<string, BracketMatch> = {};
  for (const r of (pb.data ?? []) as BracketMatchRow[]) {
    const v = venueByMatch.get(r.match_id);
    matches[r.match_id] = {
      ...r,
      venue: v?.venue ?? null,
      city: v?.city ?? null,
      country: v?.country ?? null,
      kickoff_utc: v?.kickoff_utc ?? null,
    };
  }
  const champion = matches["M104"]?.proj_winner ?? null;
  return { run, champion, matches };
}

/** The FROZEN cond0 champion's title probability: the pre-tournament pick's champion% from the
 *  same locked cond0 run getPreTournamentBracket anchors to (the EARLIEST conditioned_on_results = 0
 *  run by created_at). Reads only, never recomputes the model. Both reads are run_id / row filtered
 *  (scaling-guard-safe): the run select is .eq + .order + .limit(1); the probability select is
 *  .eq(run_id).eq(team).limit(1). Returns null when no cond0 run exists (the dual card then degrades
 *  its LEFT half to the visible "pre-tournament bracket unavailable" state). Cached. */
export function getPreTournamentChampionPct(): Promise<{ team: string; champion: number } | null> {
  return cachedRead("pretournament-champion-pct", [TAGS.bracket, TAGS.forecast, TAGS.run], _getPreTournamentChampionPctUncached);
}

async function _getPreTournamentChampionPctUncached(): Promise<{ team: string; champion: number } | null> {
  const sb = publicClient();
  // Same canonical anchor as getPreTournamentBracket: the EARLIEST cond0 run (immutable, hijack-proof).
  const baseRun = await sb
    .from("model_prediction_runs").select("run_id")
    .eq("conditioned_on_results", 0).order("created_at", { ascending: true }).limit(1);
  if (baseRun.error) throw baseRun.error;
  const runId = (baseRun.data?.[0] as { run_id: string } | undefined)?.run_id ?? null;
  if (!runId) return null;

  // The cond0 champion is the cond0 bracket's M104 winner. Read that bracket row (run_id filtered),
  // then read that team's champion% from team_probabilities (run_id + team filtered).
  const champRow = await sb
    .from("projected_bracket").select("proj_winner").eq("run_id", runId).eq("match_id", "M104").limit(1);
  if (champRow.error) throw champRow.error;
  const team = (champRow.data?.[0] as { proj_winner: string | null } | undefined)?.proj_winner ?? null;
  if (!team) return null;

  const prob = await sb
    .from("team_probabilities").select("champion").eq("run_id", runId).eq("team", team).limit(1);
  if (prob.error) throw prob.error;
  const champion = (prob.data?.[0] as { champion: number | null } | undefined)?.champion ?? null;
  if (champion == null) return null;
  return { team, champion };
}

/** Projected group tables for the current run - finishing order + qualification odds (4C.4),
 *  with the three-state scaffold (4C.4.1). The locked pre-tournament BASELINE is the cond0 run
 *  (conditioned_on_results = 0) - its projected rank/qualify is the fixed reference for the pred
 *  chip + the live movement delta. Live/final fields are null until the recalc pipeline supplies
 *  real standings; today every group is "projected". */
export function getGroupProjections(): Promise<GroupProjection[]> {
  return cachedRead("group-projections", [TAGS.groups, TAGS.run], _getGroupProjectionsUncached);
}

async function _getGroupProjectionsUncached(): Promise<GroupProjection[]> {
  const sb = publicClient();
  const { data: runs, error } = await sb.from("current_run").select("run_id").limit(1);
  if (error) throw error;
  const runId = (runs?.[0] as { run_id: string } | undefined)?.run_id ?? null;
  if (!runId) return [];

  // Baseline = the locked pre-tournament run (conditioned_on_results = 0).
  const baseRun = await sb
    .from("model_prediction_runs").select("run_id")
    .eq("conditioned_on_results", 0).order("created_at", { ascending: false }).limit(1);
  const baselineId = (baseRun.data?.[0] as { run_id: string } | undefined)?.run_id ?? runId;

  const [gp, base, tm] = await Promise.all([
    sb.from("group_standings_projection").select("*").eq("run_id", runId),
    baselineId === runId
      ? Promise.resolve({ data: null, error: null })
      : sb.from("group_standings_projection").select("group_code, team, proj_rank, p_first, p_second, p_best_third").eq("run_id", baselineId),
    // scaling-guard-ok: teams is bounded by the tournament (48 rows, the qualified field)
    sb.from("teams").select("name, host_flag, fifa_rank"),
  ]);
  if (gp.error) throw gp.error;
  if (tm.error) throw tm.error;

  const teamMeta = new Map<string, { host: boolean; rank: number | null }>(
    ((tm.data ?? []) as { name: string; host_flag: boolean; fifa_rank: number | null }[])
      .map((t) => [t.name, { host: t.host_flag, rank: t.fifa_rank }])
  );
  // baseline pred rank + qualify per team (defaults to the current run when it IS the baseline)
  const baseRows = (base.data ?? gp.data ?? []) as GroupStandingRow[];
  const baseline = new Map<string, { predRank: number; qualify: number }>(
    baseRows.map((r) => [r.team, { predRank: r.proj_rank, qualify: Math.min(1, r.p_first + r.p_second + r.p_best_third) }])
  );

  const byGroup = new Map<string, GroupTableTeam[]>();
  for (const r of (gp.data ?? []) as GroupStandingRow[]) {
    if (!byGroup.has(r.group_code)) byGroup.set(r.group_code, []);
    const meta = teamMeta.get(r.team);
    const pTop2 = r.p_first + r.p_second;
    const b = baseline.get(r.team) ?? { predRank: r.proj_rank, qualify: Math.min(1, pTop2 + r.p_best_third) };
    byGroup.get(r.group_code)!.push({
      team: r.team,
      hostFlag: meta?.host ?? false,
      fifaRank: meta?.rank ?? null,
      elo: teamElo(r.team),
      pWinGroup: r.p_first,
      pTop2,
      pBestThird: r.p_best_third,
      pQualify: Math.min(1, pTop2 + r.p_best_third),
      predRank: b.predRank,
      baselineQualify: b.qualify,
      // live/final supplied by recalc (live-phase); null today → Projected renders cleanly
      points: null, liveRank: null, qualifyDelta: null,
      finalRank: null, qualified: null, predCorrect: null,
    });
  }
  return [...byGroup.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([group_code, teams]) => ({
      group_code,
      status: "projected" as const,
      played: 0,
      teams: teams.sort((a, b) => a.predRank - b.predRank),
    }));
}

export async function getTeams(): Promise<Team[]> {
  const sb = publicClient(); // C1: cookie-free public read (was the cookie-bound server client, which forced every consumer route dynamic)
  // scaling-guard-ok: teams is bounded by the tournament (48 rows, the qualified field)
  const { data, error } = await sb.from("teams").select("*").order("group_code");
  if (error) throw error;
  return (data ?? []) as Team[];
}

export async function getFixtures(): Promise<Fixture[]> {
  const sb = publicClient(); // C1: cookie-free public read (was the cookie-bound server client, which forced every consumer route dynamic)
  // scaling-guard-ok: fixtures is bounded by the tournament (<=104 rows, the full match calendar)
  const { data, error } = await sb.from("fixtures").select("*").order("match_no");
  if (error) throw error;
  return (data ?? []) as Fixture[];
}

/** Pre-tournament: the four teams per group with their advance-group odds (no standings yet). */
export async function getGroupSnapshot(): Promise<GroupSnapshot[]> {
  const [teams, forecast] = await Promise.all([getTeams(), getCurrentForecast()]);
  const advance = new Map<string, number | null>(
    (forecast?.teamProbabilities ?? []).map((t) => [t.team, t.advance_group])
  );
  const byGroup = new Map<string, GroupSnapshot>();
  for (const t of teams) {
    if (!byGroup.has(t.group_code)) byGroup.set(t.group_code, { group_code: t.group_code, teams: [] });
    byGroup.get(t.group_code)!.teams.push({
      team: t.name,
      advance_group: advance.get(t.name) ?? null,
      host_flag: t.host_flag,
    });
  }
  const groups = [...byGroup.values()].sort((a, b) => a.group_code.localeCompare(b.group_code));
  for (const g of groups) {
    g.teams.sort((a, b) => (b.advance_group ?? 0) - (a.advance_group ?? 0));
  }
  return groups;
}

/** Convenience for the smoke test: the current champion leader. */
export async function getChampionLeader(): Promise<{ team: string; champion: number } | null> {
  const f = await getCurrentForecast();
  if (!f) return null;
  const sorted = [...f.teamProbabilities].sort((a, b) => (b.champion ?? 0) - (a.champion ?? 0));
  const top = sorted[0];
  return top ? { team: top.team, champion: top.champion ?? 0 } : null;
}

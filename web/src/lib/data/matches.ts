import "server-only";
import { publicClient } from "@/lib/supabase/public";
import { cachedRead, TAGS } from "@/lib/data/cache";
import { overlayResolvedKo, type BracketResolvedRow } from "@/lib/data/resolveKo";
import { buildContributions, type RawMatchStat } from "@/lib/data/matchContributions";
import { fetchWinProbTrend } from "@/lib/data/winProbTrendFetch";
import type {
  Fixture, ModelPredictionRun, MatchProbabilities, UpcomingMatch,
  MatchFactors, MatchDetail, MatchExtrasRow, MatchTeamStatLine,
} from "@/lib/types";

// Match-list + match-detail reads for the /matches surfaces. Split out of lib/data.ts as a pure move
// (zero logic change); lib/data re-exports these for import stability.

/** All group fixtures (scheduled AND finished) for the /matches index: W/D/L odds from the
 *  current run, plus the recorded final score where one exists. */
export function getMatchList(): Promise<UpcomingMatch[]> {
  return cachedRead("match-list", [TAGS.matches, TAGS.run], _getMatchListUncached);
}

async function _getMatchListUncached(): Promise<UpcomingMatch[]> {
  const sb = publicClient();
  const { data: runs, error } = await sb.from("current_run").select("run_id").limit(1);
  if (error) throw error;
  const runId = (runs?.[0] as { run_id: string } | undefined)?.run_id ?? null;

  const [fx, mp, mr] = await Promise.all([
    sb.from("fixtures").select("*").eq("stage", "group").order("match_no"),
    runId
      ? sb.from("match_probabilities").select("*").eq("run_id", runId)
      : Promise.resolve({ data: [], error: null }),
    // scaling-guard-ok: match_results is bounded by the tournament (<=104 rows, one per match)
    sb.from("match_results").select("match_id, home_score, away_score, status"),
  ]);
  if (fx.error) throw fx.error;
  if (mp.error) throw mp.error;
  if (mr.error) throw mr.error;

  const probs = new Map<string, MatchProbabilities>(
    ((mp.data ?? []) as MatchProbabilities[]).map((m) => [m.match_id, m])
  );
  // home/away = the fixture's team_a/team_b (match_results convention; see lib/data/groups.ts).
  // Only status='completed' counts as a final score - a half_time row is not finished.
  const results = new Map<string, { a: number; b: number }>(
    ((mr.data ?? []) as { match_id: string; home_score: number; away_score: number; status: string }[])
      .filter((r) => r.status === "completed")
      .map((r) => [r.match_id, { a: r.home_score, b: r.away_score }])
  );
  return ((fx.data ?? []) as Fixture[])
    .filter((f) => f.team_a && f.team_b)
    .sort((a, b) => {
      const ka = a.kickoff_utc ?? "", kb = b.kickoff_utc ?? "";
      return ka === kb ? a.match_no - b.match_no : ka.localeCompare(kb);
    })
    .map((f) => {
      const result = results.get(f.match_id) ?? null;
      return {
        match_id: f.match_id, match_no: f.match_no,
        team_a: f.team_a as string, team_b: f.team_b as string,
        city: f.city, country: f.country, kickoff_utc: f.kickoff_utc,
        probs: probs.get(f.match_id) ?? null, factors: null,
        result, finished: result != null || f.status === "completed",
      };
    });
}

/** Everything a /match/[id] page needs for one fixture, on the current run. Returns null if the
 *  fixture doesn't exist. `scorelines`/`h2h` are null if match_extras isn't populated yet. */
export function getMatchDetail(matchId: string): Promise<MatchDetail | null> {
  return cachedRead(`match-detail:${matchId}`, [TAGS.matches, TAGS.run], () => _getMatchDetailUncached(matchId));
}

async function _getMatchDetailUncached(matchId: string): Promise<MatchDetail | null> {
  const sb = publicClient();
  const { data: runs, error: runErr } = await sb.from("current_run").select("*").limit(1);
  if (runErr) throw runErr;
  const run = (runs?.[0] as ModelPredictionRun | undefined) ?? null;

  const [{ data: fxRows, error: fxErr }, mr, pb] = await Promise.all([
    sb.from("fixtures").select("*").eq("match_id", matchId).limit(1),
    sb.from("match_results").select("home_score, away_score, status, winner_team").eq("match_id", matchId),
    // TRACK 1 parity: a knockout fixture keeps team_a/team_b NULL in the fixtures table until its feeder
    // resolves, but the projected_bracket carries the resolved participants per side (the same overlay the
    // /matches list applies in lib/data/daily.ts). Fetch it so a resolved knockout match resolves its
    // teams below and renders MatchView instead of the "Match not set yet" placeholder.
    run
      ? sb.from("projected_bracket").select("team_a, team_b, a_resolved, b_resolved")
          .eq("run_id", run.run_id).eq("match_id", matchId).limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (fxErr) throw fxErr;
  if (mr.error) throw mr.error;
  if (pb.error) throw pb.error;
  const fixture = (fxRows?.[0] as Fixture | undefined) ?? null;
  if (!fixture) return null;

  // Overlay the resolved knockout sides onto the fixture (the SAME per-side rule the /matches list uses,
  // so the list and the detail page agree by construction). Only a bracket-resolved side fills; a still
  // undecided side stays null and the page keeps the placeholder for that genuinely unresolved slot.
  overlayResolvedKo(fixture, (pb.data?.[0] as BracketResolvedRow | undefined) ?? null);

  // home/away = the fixture's team_a/team_b (match_results convention; see lib/data/groups.ts).
  // Only status='completed' is a final score - a half_time row is not finished.
  const mrRow = ((mr.data ?? []) as
    { home_score: number; away_score: number; status: string; winner_team: string | null }[])
    .find((r) => r.status === "completed") ?? null;
  const result = mrRow ? { a: mrRow.home_score, b: mrRow.away_score } : null;
  const finished = result != null || fixture.status === "completed";
  const winnerTeam = mrRow?.winner_team ?? null;

  // Wave 1.7 shootout tally + end state. Separate, fail-soft read: pen_home_score/pen_away_score/
  // end_state (db/schema_j.sql) may not exist yet, so a select error here must not break the page -
  // the advancer still shows from winner_team, just without the "(4-3)" tally, until the DDL is run.
  let pens: MatchDetail["pens"] = null;
  let endState: MatchDetail["endState"] = null;
  {
    const pn = await sb.from("match_results")
      .select("pen_home_score, pen_away_score, end_state, status").eq("match_id", matchId);
    if (!pn.error) {
      const pr = ((pn.data ?? []) as
        { pen_home_score: number | null; pen_away_score: number | null; end_state: string | null; status: string }[])
        .find((r) => r.status === "completed") ?? null;
      if (pr) {
        endState = pr.end_state ?? null;
        if (pr.pen_home_score != null && pr.pen_away_score != null) {
          pens = { a: pr.pen_home_score, b: pr.pen_away_score };
        }
      }
    }
  }

  let probs: MatchDetail["probs"] = null;
  let factors: MatchFactors | null = null;
  let scorelines: MatchDetail["scorelines"] = null;
  let h2h: MatchDetail["h2h"] = null;

  if (run) {
    const [mp, mf] = await Promise.all([
      sb.from("match_probabilities").select("*").eq("run_id", run.run_id).eq("match_id", matchId).limit(1),
      sb.from("match_factors").select("factors").eq("run_id", run.run_id).eq("match_id", matchId).limit(1),
    ]);
    if (!mp.error) probs = (mp.data?.[0] as MatchDetail["probs"]) ?? null;
    if (!mf.error) factors = ((mf.data?.[0] as { factors: MatchFactors | null } | undefined)?.factors) ?? null;

    // match_extras may not exist yet (schema_e pending) - swallow its error and render core content.
    try {
      const me = await sb.from("match_extras").select("scorelines, h2h")
        .eq("run_id", run.run_id).eq("match_id", matchId).limit(1);
      if (!me.error && me.data?.[0]) {
        const row = me.data[0] as Pick<MatchExtrasRow, "scorelines" | "h2h">;
        scorelines = row.scorelines;
        h2h = row.h2h;
      }
    } catch {
      /* match_extras table not present yet */
    }
  }

  // Wave 1.3 goalscorers + bookings: pure display of player_match_stats we already ingest. Finished
  // matches only; bounded by squad size so no pagination; fail-soft (tables/cols may be absent).
  let contributions: MatchDetail["contributions"] = null;
  if (finished && fixture.team_a && fixture.team_b) {
    try {
      // scaling-guard-ok: one match's player rows are bounded by squad size (<= ~26 per team)
      const ps = await sb.from("player_match_stats")
        .select("player_id, goals, own_goals, yellow, red").eq("match_id", matchId);
      if (!ps.error && ps.data?.length) {
        const ids = [...new Set((ps.data as RawMatchStat[]).map((r) => r.player_id))];
        const pl = await sb.from("players").select("id, name, nation").in("id", ids);
        const identity = new Map<string, { name: string; nation: string | null }>();
        for (const p of (pl.data ?? []) as { id: string; name: string; nation: string | null }[]) {
          identity.set(p.id, { name: p.name, nation: p.nation });
        }
        contributions = buildContributions(
          ps.data as RawMatchStat[], identity, fixture.team_a, fixture.team_b);
      }
    } catch {
      /* player_match_stats / players not present yet - degrade to no scorers */
    }
  }

  // Wave 1.4 win-prob-over-time: this fixture's W/D/L across the retained runs (fail-soft to []).
  let winProbTrend: MatchDetail["winProbTrend"] = null;
  try {
    winProbTrend = await fetchWinProbTrend(matchId);
  } catch {
    /* history read failed - hide the trend */
  }

  // Wave 1.5 - a finished match's CURRENT-run match_probabilities row still EXISTS but carries NULL
  // W/D/L (recalc writes a per-fixture row every run, nulled once the match is played), and its
  // current-run match_factors row is absent. So "has a real pre-match read" means non-null prob FIELDS,
  // not a non-null row. Backfill both from the LAST PRE-KICKOFF run - the final point of the win-prob
  // trend, which now excludes null-prob runs, so it is a valid pre-kickoff run. Honest "what the model
  // predicted before kickoff", so the prediction + factor-breakdown cards render on a finished page.
  const preHasProbs = probs != null && probs.p_team_a_win != null;
  if (finished && winProbTrend && winProbTrend.length > 0 && (!preHasProbs || factors == null)) {
    const preRunId = winProbTrend[winProbTrend.length - 1].run_id;
    try {
      const [mp, mf] = await Promise.all([
        !preHasProbs
          ? sb.from("match_probabilities").select("*").eq("run_id", preRunId).eq("match_id", matchId).limit(1)
          : Promise.resolve({ data: null, error: null }),
        factors == null
          ? sb.from("match_factors").select("factors").eq("run_id", preRunId).eq("match_id", matchId).limit(1)
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!mp.error && mp.data?.[0]) probs = mp.data[0] as MatchDetail["probs"];
      if (!mf.error && mf.data?.[0]) factors = (mf.data[0] as { factors: MatchFactors | null }).factors ?? null;
    } catch {
      /* pre-kickoff read failed - a finished match just shows its result, as before */
    }
  }

  // Wave 1.6 team match stats (DISPLAY ONLY - never the model/quorum). match_team_stats may not exist
  // yet (schema_j pending) and is populated by db/ingest_match_stats.py; fail-soft to null so the card
  // simply does not render until then.
  let teamStats: MatchDetail["teamStats"] = null;
  if (fixture.team_a && fixture.team_b) {
    // scaling-guard-ok: one match has at most two rows (one per team)
    const ts = await sb.from("match_team_stats")
      .select("team, possession, shots, shots_on_target, corners, fouls, offsides, yellow, red, source")
      .eq("match_id", matchId);
    if (!ts.error && ts.data?.length) {
      const byTeam = new Map((ts.data as MatchTeamStatLine[]).map((r) => [r.team, r]));
      const ta = byTeam.get(fixture.team_a) ?? null;
      const tb = byTeam.get(fixture.team_b) ?? null;
      if (ta || tb) teamStats = { team_a: ta, team_b: tb };
    }
  }

  return {
    run, fixture, probs, factors, scorelines, h2h, result, finished, contributions, winProbTrend,
    winnerTeam, pens, endState, teamStats,
  };
}

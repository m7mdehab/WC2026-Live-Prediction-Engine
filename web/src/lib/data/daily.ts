// daily-briefing data layer - owned by the Daily track.
//
// The /daily pages are SELF-POPULATING from model data: the tournament calendar, the real
// scheduled fixtures per date (+ live model probabilities when a run is published), and a
// computed-on-read briefing per date (result recap vs the run that preceded that day, biggest
// champion-odds movers vs the latest run, what the model is watching next, and a rule-based
// headline). The pure derivation rules live in dailyAuto.ts; this module does the DB reads.
//
// Source of truth at runtime is Supabase (fixtures + match_results + match_probabilities +
// model_prediction_runs + team_probabilities), exactly like /matches. When the DB isn't reachable
// (e.g. local preview with no env, or an outage) we fall back to a bundled static copy of the
// authoritative schedule so the page is always demonstrably functional rather than an empty
// shell. The static copy carries no model probabilities or results - the honest "schedule known,
// briefing pending" state.
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { publicClient } from "@/lib/supabase/public";
import { cachedRead, TAGS } from "@/lib/data/cache";
import type { Fixture, MatchProbabilities, Stage } from "@/lib/types";
import {
  buildHeadline, buildMovers, buildRecap, buildWatching, emptyAuto, nextMatchday,
  type AutoProbs, type BriefingAuto,
} from "./dailyAuto";
import scheduleJson from "./schedule_2026.json";

export type { BriefingAuto, Mover, RecapRow, Watching } from "./dailyAuto";
export { emptyAuto } from "./dailyAuto";

// Tournament window (UTC calendar dates). Match M001 kicks off 2026-06-11; the Final is 2026-07-19.
export const TOURNAMENT_START = "2026-06-11";
export const TOURNAMENT_END = "2026-07-19";

/** A scheduled fixture as the briefing needs it: real teams for the group stage, bracket slots for
 *  not-yet-determined knockout matchups, plus venue/kickoff and (when live) model probabilities. */
export interface DailyFixture {
  match_id: string;
  match_no: number;
  stage: Stage;
  group_code: string | null;
  team_a: string | null;
  team_b: string | null;
  team_a_slot: string | null;
  team_b_slot: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  kickoff_utc: string | null;
  status: "scheduled" | "completed";
  probs: MatchProbabilities | null;
  /** Recorded final score (team_a-team_b orientation; match_results convention), if any. */
  result: { a: number; b: number } | null;
  /** True when a completed result is recorded (or the fixture is marked completed). */
  finished: boolean;
  /** Shootout advancer (match_results.winner_team), for a level knockout decided on penalties. */
  winnerTeam?: string | null;
  /** Shootout tally (team_a-team_b orientation); null until captured or the DDL is applied. */
  pens?: { a: number; b: number } | null;
}

/** One row in the /daily calendar index: a UTC date and what the schedule holds that day. */
export interface DailyDateSummary {
  date: string; // YYYY-MM-DD (UTC) - also the [date] route segment
  matchCount: number;
  /** Fixtures with a recorded result (or marked completed) - drives the rollover. */
  completedCount: number;
  stages: Stage[]; // distinct stages that day, in canonical order
}

export interface DailyIndex {
  start: string;
  end: string;
  /** Today's UTC date (request time) - for the "Today" badge only. */
  today: string;
  /** The next matchday by the UNFINISHED-MATCH rule: the earliest date with at least one fixture
   *  lacking a recorded result (NOT clock-based). Falls back to the last matchday once every
   *  match is finished (allComplete = true). */
  nearest: string | null;
  allComplete: boolean;
  dates: DailyDateSummary[];
  /** Where the schedule came from this request - surfaced honestly in the UI/docs. */
  source: "live" | "static";
}

export interface DailyBriefing {
  date: string; // YYYY-MM-DD (UTC)
  fixtures: DailyFixture[];
  source: "live" | "static";
  /** True when `date` falls inside the tournament window (vs. an arbitrary URL). */
  inWindow: boolean;
  /** The computed briefing content (recap / movers / watching / headline). */
  auto: BriefingAuto;
  /** Human label of the watching date (precomputed server-side; null when none). */
  watchingLabel: string | null;
}

const STAGE_ORDER: Stage[] = [
  "group", "round_of_32", "round_of_16", "quarter_finals",
  "semi_finals", "third_place_playoff", "final",
];

// A fixtures row as it arrives from either source. The DB `fixtures` table and the bundled static
// schedule share this shape; the one difference the normalizer reconciles is WHERE the knockout
// bracket slot lives (see toDailyFixture).
interface FixtureRow {
  match_id: string;
  match_no: number;
  stage: string;
  group_code: string | null;
  team_a: string | null;
  team_b: string | null;
  team_a_slot: string | null;
  team_b_slot: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  kickoff_utc: string | null;
  status: "scheduled" | "completed";
}

/** True if a fixtures team value is an unresolved bracket slot ("1A", "2B", "best3_of_…", "W74",
 *  "L101") rather than a resolved country. Real WC2026 country names never match these shapes. */
function isSlotCode(v: string | null): boolean {
  if (!v) return false;
  return /^[123][A-L]$/.test(v) || /^best3/i.test(v) || /^[WL]\d+$/.test(v);
}

/** Normalize one fixtures row to a DailyFixture, the single invariant for BOTH the live DB path
 *  and the static fallback so they render identically:
 *   • team_a / team_b carry a RESOLVED country name only - never a bracket slot. In the DB a
 *     knockout's team_a is NULL until the bracket resolves (db/schema.sql, db/seed.py); we also
 *     null out any slot string defensively, so a slot code can never be mistaken for a team
 *     (broken flag + dead /match link - the failure the design lock forbids).
 *   • team_a_slot / team_b_slot carry the bracket slot for knockout rows. The schema/seed keep it
 *     in team_a_slot; we fall back to team_a so the slot survives even under a CSV-style layout. */
function toDailyFixture(
  f: FixtureRow,
  probs: MatchProbabilities | null,
  result: { a: number; b: number } | null,
  winnerTeam: string | null = null,
  pens: { a: number; b: number } | null = null,
): DailyFixture {
  const isGroup = f.stage === "group";
  return {
    match_id: f.match_id,
    match_no: f.match_no,
    stage: f.stage as Stage,
    group_code: f.group_code,
    team_a: isGroup || !isSlotCode(f.team_a) ? f.team_a : null,
    team_b: isGroup || !isSlotCode(f.team_b) ? f.team_b : null,
    team_a_slot: isGroup ? null : f.team_a_slot ?? f.team_a,
    team_b_slot: isGroup ? null : f.team_b_slot ?? f.team_b,
    venue: f.venue,
    city: f.city,
    country: f.country,
    kickoff_utc: f.kickoff_utc,
    status: f.status,
    probs,
    result,
    finished: result != null || f.status === "completed",
    winnerTeam,
    pens,
  };
}

// The bundled fallback schedule (authoritative fixtures CSV, derived offline). No probabilities,
// no results - the honest static state.
const STATIC_FIXTURES: DailyFixture[] = (scheduleJson as FixtureRow[]).map((f) =>
  toDailyFixture(f, null, null)
);

/** The UTC calendar date (YYYY-MM-DD) of an ISO instant. */
function utcDate(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

/** A human label for a UTC calendar date, e.g. "Thursday, 11 June". Deterministic (UTC). */
export function formatDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  }).format(d);
}

// Re-exported for existing server-side importers; the implementation lives in the pure
// lib/stage.ts so client components (DailyMatchRow via the /matches index) can use it too.
export { stageLabel } from "@/lib/stage";

/** Every UTC date from start to end inclusive. Exported for /matches/day/[date] generateStaticParams. */
export function dateSpan(start: string, end: string): string[] {
  const out: string[] = [];
  const oneDay = 86_400_000;
  const last = Date.parse(`${end}T00:00:00Z`);
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= last; t += oneDay) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

interface RunRef {
  run_id: string;
  created_at: string;
}

interface LoadedFixtures {
  fixtures: DailyFixture[];
  source: "live" | "static";
  /** The current run (null when none is published, or on the static path). */
  currentRun: RunRef | null;
}

/** Load all fixtures (whole tournament) with live probabilities and recorded results, falling
 *  back to the bundled static schedule if the DB is unreachable. Marks which source answered. */
async function loadFixtures(): Promise<LoadedFixtures> {
  try {
    const sb = publicClient();
    const { data: runs, error: runErr } = await sb
      .from("current_run").select("run_id, created_at").limit(1);
    if (runErr) throw runErr;
    const currentRun = (runs?.[0] as RunRef | undefined) ?? null;

    const [fx, mp, mr, pb] = await Promise.all([
      // scaling-guard-ok: fixtures is bounded by the tournament (<=104 rows, the full match calendar)
      sb.from("fixtures").select("*").order("match_no"),
      currentRun
        ? sb.from("match_probabilities").select("*").eq("run_id", currentRun.run_id)
        : Promise.resolve({ data: [], error: null }),
      // scaling-guard-ok: match_results is bounded by the tournament (<=104 rows, one per match)
      sb.from("match_results").select("match_id, home_score, away_score, status, winner_team"),
      // TRACK 1: the projected bracket carries the RESOLVED knockout participants per SIDE. We overlay
      // those onto the knockout DailyFixtures so the R32/R16 cards show the ACTUAL teams the moment a
      // side resolves (group complete for R32; a decided feeder for R16+), with the opposite side
      // staying its slot label (TBD) until its own feeder is decided. scaling-guard-ok: <=32 KO rows.
      currentRun
        ? sb.from("projected_bracket")
            .select("match_id, team_a, team_b, a_resolved, b_resolved")
            .eq("run_id", currentRun.run_id)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (fx.error) throw fx.error;
    if (mp.error) throw mp.error;
    if (mr.error) throw mr.error;
    if (pb.error) throw pb.error;

    const probs = new Map<string, MatchProbabilities>(
      ((mp.data ?? []) as MatchProbabilities[]).map((m) => [m.match_id, m])
    );
    // home/away = the fixture's team_a/team_b (match_results convention; see lib/data/groups.ts).
    // Only status='completed' counts as a recorded result - a half_time row is not finished.
    const results = new Map<string, { a: number; b: number }>(
      ((mr.data ?? []) as { match_id: string; home_score: number; away_score: number; status: string }[])
        .filter((r) => r.status === "completed")
        .map((r) => [r.match_id, { a: r.home_score, b: r.away_score }])
    );
    // Wave 1.7: shootout advancer (winner_team, in the main read) + tally for the list cards. The pens
    // tally is a SEPARATE, fail-soft read - pen_home_score/pen_away_score may not exist yet (schema_j
    // pending) - so a select error there must never break the calendar.
    const winnerByMatch = new Map<string, string>();
    for (const r of (mr.data ?? []) as { match_id: string; status: string; winner_team: string | null }[]) {
      if (r.status === "completed" && r.winner_team) winnerByMatch.set(r.match_id, r.winner_team);
    }
    const pensByMatch = new Map<string, { a: number; b: number }>();
    {
      // scaling-guard-ok: match_results is bounded by the tournament (<=104 rows, one per match)
      const pn = await sb.from("match_results").select("match_id, pen_home_score, pen_away_score, status");
      if (!pn.error) {
        for (const r of (pn.data ?? []) as
          { match_id: string; pen_home_score: number | null; pen_away_score: number | null; status: string }[]) {
          if (r.status === "completed" && r.pen_home_score != null && r.pen_away_score != null) {
            pensByMatch.set(r.match_id, { a: r.pen_home_score, b: r.pen_away_score });
          }
        }
      }
    }
    // Resolved knockout occupants, PER SIDE. A side is overlaid onto the fixture only when the
    // projected bracket marks it resolved (its feeder is decided), so an undecided side keeps its
    // slot code and renders as TBD; this is the progressive per-side fill on the knockout cards.
    const koResolved = new Map<string, { a: string | null; b: string | null }>();
    for (const r of (pb.data ?? []) as {
      match_id: string; team_a: string | null; team_b: string | null;
      a_resolved: boolean; b_resolved: boolean;
    }[]) {
      koResolved.set(r.match_id, {
        a: r.a_resolved ? r.team_a : null,
        b: r.b_resolved ? r.team_b : null,
      });
    }
    const fixtures = ((fx.data ?? []) as Fixture[])
      .slice()
      .sort((a, b) => a.match_no - b.match_no)
      .map((f) => {
        const df = toDailyFixture(f, probs.get(f.match_id) ?? null, results.get(f.match_id) ?? null,
          winnerByMatch.get(f.match_id) ?? null, pensByMatch.get(f.match_id) ?? null);
        if (df.stage !== "group") {
          const ko = koResolved.get(f.match_id);
          if (ko) {
            if (ko.a) df.team_a = ko.a;
            if (ko.b) df.team_b = ko.b;
          }
        }
        return df;
      });
    return { fixtures, source: "live", currentRun };
  } catch {
    // DB not configured / unreachable → bundled schedule keeps the page functional.
    return { fixtures: STATIC_FIXTURES, source: "static", currentRun: null };
  }
}

/** Group fixtures by their UTC calendar date. */
function byDate(fixtures: DailyFixture[]): Map<string, DailyFixture[]> {
  const map = new Map<string, DailyFixture[]>();
  for (const f of fixtures) {
    const d = utcDate(f.kickoff_utc);
    if (!d) continue;
    const bucket = map.get(d);
    if (bucket) bucket.push(f);
    else map.set(d, [f]);
  }
  return map;
}

/** Build the calendar index from already-loaded fixtures (shared by getDailyIndex and
 *  getMatchesData so the merged /matches page reads the fixtures exactly once). */
function buildIndex(fixtures: DailyFixture[], source: "live" | "static"): DailyIndex {
  const map = byDate(fixtures);
  const today = new Date().toISOString().slice(0, 10);

  const dates: DailyDateSummary[] = dateSpan(TOURNAMENT_START, TOURNAMENT_END).map((date) => {
    const day = map.get(date) ?? [];
    const stages = STAGE_ORDER.filter((s) => day.some((f) => f.stage === s));
    return {
      date,
      matchCount: day.length,
      completedCount: day.filter((f) => f.finished).length,
      stages,
    };
  });

  const { next, allComplete } = nextMatchday(
    dates.map((d) => ({ date: d.date, matchCount: d.matchCount, finishedCount: d.completedCount }))
  );

  return { start: TOURNAMENT_START, end: TOURNAMENT_END, today, nearest: next, allComplete, dates, source };
}

/** The matchday calendar: the full tournament window, each date annotated with its real schedule.
 *  The highlighted matchday follows the UNFINISHED-MATCH rule (dailyAuto.nextMatchday), not the
 *  clock: a day rolls over the moment its last result is recorded. */
export async function getDailyIndex(): Promise<DailyIndex> {
  const { fixtures, source } = await loadFixtures();
  return buildIndex(fixtures, source);
}

/** Everything the consolidated /matches index needs in ONE fixtures read: the calendar index
 *  (next-matchday rule, per-date summaries) plus the full-tournament fixture list - group AND
 *  knockout, with live odds/results when published. */
export interface MatchesData {
  index: DailyIndex;
  fixtures: DailyFixture[];
  source: "live" | "static";
}

export function getMatchesData(): Promise<MatchesData> {
  return cachedRead("matches-data", [TAGS.matches, TAGS.run], _getMatchesDataUncached);
}

async function _getMatchesDataUncached(): Promise<MatchesData> {
  const { fixtures, source } = await loadFixtures();
  return { index: buildIndex(fixtures, source), fixtures, source };
}

/** An in-progress (not-completed) scoreline for ONE match, when the score store happens to carry a
 *  non-completed row for it. See getLiveScore for the full provenance / defensible-call note. */
export interface LiveScore {
  a: number;
  b: number;
}

/** Read the IN-PROGRESS score for a single live fixture, if one is reliably persisted.
 *
 *  PROVENANCE / DEFENSIBLE CALL. The only score store is match_results. The only production writer
 *  (db/enter_result.py) writes home_score/away_score with status='completed'; DailyFixture.result is
 *  therefore the COMPLETED final score only. schema_g added a half_time status plus ht_home_score /
 *  ht_away_score columns, but NO production path populates them today (db/recalc.py explicitly does
 *  NOT fold half_time rows: "half-time mode is a fast-follow"). So a true mid-match live score is not
 *  reliably persisted; the matchday card must NOT fabricate one.
 *
 *  This read is the honest middle ground: it asks the score store, FILTERED to the one live match
 *  (.eq match_id, .limit 1, scaling-guard-safe), for a NON-completed row that nonetheless carries a
 *  score (home_score/away_score are NOT NULL on the table, so a half_time row would expose a real
 *  in-progress scoreline). If such a row exists it returns that score; otherwise null. The caller
 *  renders the score only when this returns non-null, and shows an "in progress" marker (teams +
 *  flags + kickoff) without a score otherwise. It never invents a score. */
export function getLiveScore(matchId: string): Promise<LiveScore | null> {
  return cachedRead(`live-score:${matchId}`, [TAGS.matches, TAGS.run], () => _getLiveScoreUncached(matchId));
}

async function _getLiveScoreUncached(matchId: string): Promise<LiveScore | null> {
  try {
    const sb = publicClient();
    // Row-FILTERED + BOUNDED single read (scaling-guard-safe): one match_results row by match_id.
    const { data, error } = await sb
      .from("match_results")
      .select("home_score, away_score, status")
      .eq("match_id", matchId)
      .limit(1);
    if (error) throw error;
    const row = (data?.[0] as { home_score: number; away_score: number; status: string } | undefined) ?? null;
    // A 'completed' row is the FINAL score (already surfaced as DailyFixture.result), not a live one;
    // only a non-completed row with a score (e.g. half_time) is an in-progress scoreline.
    if (!row || row.status === "completed") return null;
    if (typeof row.home_score !== "number" || typeof row.away_score !== "number") return null;
    return { a: row.home_score, b: row.away_score };
  } catch {
    return null;
  }
}

/** Kickoff-ordered fixtures for one UTC date. */
function fixturesOn(fixtures: DailyFixture[], date: string): DailyFixture[] {
  return fixtures
    .filter((f) => utcDate(f.kickoff_utc) === date)
    .sort((a, b) => {
      const ka = a.kickoff_utc ?? "", kb = b.kickoff_utc ?? "";
      return ka === kb ? a.match_no - b.match_no : ka.localeCompare(kb);
    });
}

/** The run that was current before this day's first kickoff (the pre-matchday run): the latest
 *  non-archived run (conditioned_on_results >= 0; -1 is the archive sentinel) created strictly
 *  before the kickoff instant. Post-result runs NULL a completed match's probabilities, so the
 *  recap MUST read this run, never the latest.
 *  Exported for the home surface (title-race movement deltas), which must use the SAME pre-day
 *  run selection as this briefing. */
export async function preMatchdayRun(
  sb: SupabaseClient,
  firstKickoff: string
): Promise<RunRef | null> {
  const { data, error } = await sb
    .from("model_prediction_runs")
    .select("run_id, created_at")
    .gte("conditioned_on_results", 0)
    .lt("created_at", firstKickoff)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as RunRef | undefined) ?? null;
}

/** champion-odds map (team -> 0..1) for a set of runs, in one query. */
async function championByRun(
  sb: SupabaseClient,
  runIds: string[]
): Promise<Map<string, Map<string, number | null>>> {
  const out = new Map<string, Map<string, number | null>>();
  if (runIds.length === 0) return out;
  const { data, error } = await sb
    .from("team_probabilities")
    .select("run_id, team, champion")
    .in("run_id", runIds);
  if (error) throw error;
  for (const r of (data ?? []) as { run_id: string; team: string; champion: number | null }[]) {
    let m = out.get(r.run_id);
    if (!m) { m = new Map(); out.set(r.run_id, m); }
    m.set(r.team, r.champion);
  }
  return out;
}

/** Compute the briefing's auto content for one date (live path). Any failure degrades to the
 *  empty briefing rather than breaking the page. */
async function buildAuto(
  date: string,
  day: DailyFixture[],
  all: DailyFixture[],
  currentRun: RunRef | null
): Promise<{ auto: BriefingAuto; watchingLabel: string | null }> {
  // What the model is watching: the NEXT matchday after this date, on the current run's odds
  // (already attached to the fixtures). Derivable even when run-lineage queries fail.
  const nextDate =
    [...byDate(all).keys()].sort().find((d) => d > date) ?? null;
  const watching = nextDate ? buildWatching(nextDate, fixturesOn(all, nextDate)) : null;
  const watchingLabel = nextDate ? formatDateLabel(nextDate) : null;

  let recap: BriefingAuto["recap"] = [];
  let movers: BriefingAuto["movers"] = null;
  let champ: Map<string, number | null> | null = null;

  try {
    const sb = publicClient();
    const firstKickoff = day.find((f) => f.kickoff_utc)?.kickoff_utc ?? null;
    const pre = firstKickoff ? await preMatchdayRun(sb, firstKickoff) : null;

    // Pre-matchday odds for the recap: the pre-run's match_probabilities (or the already-loaded
    // current-run odds when the pre-run IS the current run).
    const preProbs = new Map<string, AutoProbs>();
    if (pre && currentRun && pre.run_id === currentRun.run_id) {
      for (const f of day) if (f.probs) preProbs.set(f.match_id, f.probs);
    } else if (pre && day.length > 0) {
      const { data, error } = await sb
        .from("match_probabilities")
        .select("match_id, p_team_a_win, p_draw, p_team_b_win")
        .eq("run_id", pre.run_id)
        .in("match_id", day.map((f) => f.match_id));
      if (error) throw error;
      for (const r of (data ?? []) as ({ match_id: string } & AutoProbs)[]) {
        preProbs.set(r.match_id, r);
      }
    }
    recap = buildRecap(day, preProbs);

    // Movers: pre-matchday run vs the latest run. Only meaningful once a post-matchday run
    // exists (current !== pre); otherwise stay null → the graceful "after the next run" state.
    const runIds = [...new Set([pre?.run_id, currentRun?.run_id].filter(Boolean) as string[])];
    const byRun = await championByRun(sb, runIds);
    champ = currentRun ? byRun.get(currentRun.run_id) ?? null : null;
    if (pre && currentRun && pre.run_id !== currentRun.run_id) {
      const before = byRun.get(pre.run_id);
      const after = byRun.get(currentRun.run_id);
      if (before && after) movers = buildMovers(before, after);
    }
  } catch {
    /* lineage unavailable → recap/movers stay in their honest pending states */
  }

  const headline = buildHeadline({ recap, dayFixtures: day, champ, watching, watchingLabel });
  return { auto: { headline, recap, movers, watching }, watchingLabel };
}

/** One date's briefing: computed recap / movers / watching / headline over the scheduled
 *  fixtures (kickoff-ordered). Falls back to the empty briefing on the static path. */
export function getDailyBriefing(date: string): Promise<DailyBriefing> {
  return cachedRead(`daily-briefing:${date}`, [TAGS.matches, TAGS.run], () => _getDailyBriefingUncached(date));
}

async function _getDailyBriefingUncached(date: string): Promise<DailyBriefing> {
  const { fixtures, source, currentRun } = await loadFixtures();
  const day = fixturesOn(fixtures, date);
  const inWindow = date >= TOURNAMENT_START && date <= TOURNAMENT_END;

  let auto: BriefingAuto = emptyAuto();
  let watchingLabel: string | null = null;
  if (source === "live") {
    ({ auto, watchingLabel } = await buildAuto(date, day, fixtures, currentRun));
  }
  return { date, fixtures: day, source, inWindow, auto, watchingLabel };
}

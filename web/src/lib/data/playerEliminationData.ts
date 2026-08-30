// Server read for the eliminated-player freeze on /players. Gathers, from RESULTS only (plus the
// current run's resolved bracket for knockout orientation), the facts the PURE predicate in
// lib/data/playerElimination needs, and returns the eliminated-team facts map. Mirrors
// lib/data/resolvedStagesData: cookie-free publicClient, tournament-bounded reads, and the same pure
// group-standings + winner_team-chain helpers. Read-only; no recalc change, no new table.
//
// Fail-soft to an EMPTY map: on any read error every team is treated as ALIVE (fail-open), so a bad
// read can only ever UN-freeze a "now" value, never wrongly freeze a live player.
import "server-only";
import { publicClient } from "@/lib/supabase/public";
import { cachedRead, TAGS } from "@/lib/data/cache";
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
  type CompletedKoMatch,
  type Verdict,
} from "@/lib/data/resolvedStages";
import {
  computeEliminations,
  teamsWithForwardFixture,
  type EliminationFact,
  type EliminationFacts,
  type ForwardFixtureRow,
  type ResolvedKoSide,
  type TeamAliveFacts,
} from "@/lib/data/playerElimination";

// KO fixture stage -> round index (R32=0 .. Final=4). third_place_playoff is not a champion-ladder
// round and never attributes an elimination.
const KO_ROUND: Record<string, number> = {
  round_of_32: 0,
  round_of_16: 1,
  quarter_finals: 2,
  semi_finals: 3,
  final: 4,
};

type TeamDbRow = { name: string; group_code: string; fifa_rank: number | null };
type FixtureDbRow = {
  match_id: string; match_no: number; stage: string; group_code: string | null;
  team_a: string | null; team_b: string | null; kickoff_utc: string | null;
  city: string | null; country: string | null; status: string;
};
type ResultDbRow = { match_id: string; home_score: number; away_score: number; winner_team: string | null; status: string };
type BracketDbRow = { match_id: string; team_a: string | null; team_b: string | null; a_resolved: boolean; b_resolved: boolean };

async function fetchEliminations(): Promise<EliminationFacts> {
  const sb = publicClient();

  // current run -> its resolved projected bracket (orients knockout participants: a completed KO match
  // has both sides resolved; a scheduled next-round fixture resolves a side only once its feeder does).
  const { data: cr } = await sb.from("current_run").select("run_id").limit(1);
  const runId = (cr?.[0] as { run_id: string } | undefined)?.run_id ?? null;

  const [tm, fx, mr, ev, pb] = await Promise.all([
    // scaling-guard-ok: teams is bounded by the tournament (48 rows, the qualified field)
    sb.from("teams").select("name, group_code, fifa_rank"),
    // scaling-guard-ok: fixtures is bounded by the tournament (<=104 rows, one per match)
    sb.from("fixtures").select("match_id, match_no, stage, group_code, team_a, team_b, kickoff_utc, city, country, status"),
    // scaling-guard-ok: match_results is bounded by the tournament (<=104 rows, one per match)
    sb.from("match_results").select("match_id, home_score, away_score, winner_team, status"),
    // scaling-guard-ok: events is bounded by the tournament (cards/goals across <=104 matches)
    sb.from("events").select("match_id, team, player, event_type"),
    runId
      ? sb.from("projected_bracket").select("match_id, team_a, team_b, a_resolved, b_resolved").eq("run_id", runId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (tm.error) throw tm.error;
  if (fx.error) throw fx.error;
  if (mr.error) throw mr.error;
  if (pb.error) throw pb.error;

  const teams = (tm.data ?? []) as TeamDbRow[];
  const fixtures = (fx.data ?? []) as FixtureDbRow[];
  const results = (mr.data ?? []) as ResultDbRow[];
  const events = ev.error ? [] : ((ev.data ?? []) as ConductEvent[]);
  const bracket = (pb.data ?? []) as BracketDbRow[];

  // resolved knockout participants per match (a side is a real team only when it resolved).
  const koResolvedByMatch = new Map<string, ResolvedKoSide>();
  for (const b of bracket) {
    koResolvedByMatch.set(b.match_id, { a: b.a_resolved ? b.team_a : null, b: b.b_resolved ? b.team_b : null });
  }
  const statusByMatch = new Map<string, string>();
  for (const r of results) statusByMatch.set(r.match_id, r.status);

  // (1) advance_group verdicts via the pure groups engine (top-2 / qualifying best-third).
  const advanceVerdicts = new Map<string, Verdict>();
  try {
    const groupFixtures = fixtures.filter((f) => f.stage === "group") as unknown as GroupFixtureRow[];
    const groups = buildGroupsData(
      teams as GroupTeamRow[],
      groupFixtures,
      results as unknown as GroupResultRow[],
      events,
      [],
    );
    const allGroupsFinal = groups.status === "final";
    const bestThirdQualifies = new Map<string, boolean>();
    for (const bt of groups.bestThirds) bestThirdQualifies.set(bt.team, bt.qualifies);
    for (const g of groups.groups) {
      const groupFinal = g.status === "final";
      for (const t of g.teams) {
        advanceVerdicts.set(
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
    console.error("playerElimination: group standings read failed (advance_group -> in_progress):", err);
  }

  // (2) knockout loss round from the resolved winner_team chain (both sides must be resolved to
  // attribute a loss; a placeholder side yields no loss - never a wrong elimination).
  const koMatches: CompletedKoMatch[] = [];
  for (const f of fixtures) {
    const round = KO_ROUND[f.stage];
    if (round === undefined) continue;
    const res = results.find((r) => r.match_id === f.match_id);
    if (!res || res.status !== "completed") continue; // only a recorded completed KO match resolves a loss
    const sides = koResolvedByMatch.get(f.match_id) ?? { a: null, b: null };
    koMatches.push({ round, teamA: sides.a, teamB: sides.b, winner: res.winner_team });
  }
  const { lostRound } = koRoundsFromCompleted(koMatches);

  // (3) confirmed forward fixtures: a scheduled group fixture's named side, or a resolved knockout side.
  const forwardRows: ForwardFixtureRow[] = fixtures.map((f) => ({
    matchId: f.match_id,
    // fixtures.status can lag; prefer the match_results status when present (the authoritative completed flag).
    status: statusByMatch.get(f.match_id) ?? f.status,
    teamA: f.stage === "group" ? f.team_a : null, // only group fixtures carry confirmed named sides directly
    teamB: f.stage === "group" ? f.team_b : null,
  }));
  const forwardTeams = teamsWithForwardFixture(forwardRows, koResolvedByMatch);

  // (4) assemble per-team facts and reduce to the eliminated-only map.
  const facts: TeamAliveFacts[] = teams.map((t) => ({
    team: t.name,
    entered: true,
    advanceGroup: advanceVerdicts.get(t.name) ?? "in_progress",
    lostKoRound: lostRound.get(t.name) ?? null,
    hasConfirmedForwardFixture: forwardTeams.has(t.name),
  }));
  return computeEliminations(facts);
}

/** The eliminated-team facts map (team name -> exit stage) for the /players freeze. Cache-tagged on the
 *  results + run versions (busts when a result is recorded or a new run publishes). Fail-soft to an
 *  empty map, which fails OPEN (every team alive). */
export async function getPlayerEliminations(): Promise<EliminationFacts> {
  // cachedRead (unstable_cache) JSON-SERIALIZES its stored value, and a Map does NOT survive that
  // round-trip: it deserializes to {}, so every caller's `.get()` then throws "b.get is not a function"
  // and crashes /players to an empty board. Cache a SERIALIZABLE [key, value][] and rebuild the Map
  // OUTSIDE the cache. (Latent since the Map was first cached; it surfaced only once the run_id - and so
  // the data-version cache key - froze after the tournament, turning perpetual cache MISSES, which
  // returned the live Map, into HITS that return the broken serialized value.)
  const entries = await cachedRead<[string, EliminationFact][]>(
    "player-eliminations",
    [TAGS.players, TAGS.forecast, TAGS.run],
    async () => {
      try {
        return [...(await fetchEliminations()).entries()];
      } catch (err) {
        console.error("Failed to assemble player eliminations (failing open, all teams alive):", err);
        return [];
      }
    },
  );
  return new Map(entries);
}

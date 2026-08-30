// Eliminated-player freeze: the PURE, results-primary elimination predicate for the /players
// pre-tournament-vs-live card. Given per-team RESULTS facts (never a probability, never the schedule
// alone), it decides whether a team is ELIMINATED and at which stage it exited, so the players read
// layer can FREEZE an eliminated player's "now" projection to his as-played value and stop it
// re-projecting (a knocked-out player's "now" xG must never rise across model runs).
//
// PURE + client-safe: no server-only, no Supabase, no I/O. Unit-testable under bare Node exactly like
// lib/data/resolvedStages, whose winner_team chain + group-verdict helpers this REUSES. The server read
// that gathers the inputs lives in lib/data/playerEliminationData.ts, mirroring how surpriseIndexData
// feeds the pure surpriseIndex assembler with results-facts.
//
// PREDICATE (results-primary, NOT schedule-only). A team is ALIVE iff ALL THREE hold:
//   (1) it has NOT lost a knockout match (match_results.winner_team, penalties included), AND
//   (2) its group is incomplete OR it confirmed advancing (top-2 / qualifying best-third), AND
//   (3) a forward fixture exists with the team as a CONFIRMED, non-placeholder participant.
// ELIMINATED = entered AND NOT alive. A null/unmapped team FAILS OPEN (stays live: freezing needs
// positive proof). A transient/placeholder next-round fixture never makes a knockout loser look alive.

import type { Verdict } from "@/lib/data/resolvedStages";

/** The stage a team exited at (drives the OUT badge). Group exit or the knockout round it lost. */
export type ExitStage =
  | "group"
  | "round_of_32"
  | "round_of_16"
  | "quarter_finals"
  | "semi_finals"
  | "final";

/** Knockout round index (R32=0 .. Final=4, matching resolvedStages KO_ROUND) -> exit stage. */
const KO_ROUND_EXIT: Record<number, ExitStage> = {
  0: "round_of_32",
  1: "round_of_16",
  2: "quarter_finals",
  3: "semi_finals",
  4: "final",
};

/** Short, ASCII-only OUT-badge label per exit stage (e.g. the badge reads "OUT R16"). */
export const EXIT_STAGE_LABEL: Record<ExitStage, string> = {
  group: "Group",
  round_of_32: "R32",
  round_of_16: "R16",
  quarter_finals: "QF",
  semi_finals: "SF",
  final: "Final",
};

/** One team's results-primary facts (all from RESULTS, plus the schedule-confirmation flag). */
export interface TeamAliveFacts {
  team: string;
  /** the team is a real field participant (present in teams). false = unmapped -> never frozen. */
  entered: boolean;
  /** group-advance verdict from the final standings (achieved / failed / in_progress). Never prob==0. */
  advanceGroup: Verdict;
  /** the knockout round the team LOST (0..4) from the resolved winner_team chain, or null if it lost
   *  none. A loss is only attributed when both sides were resolved (never a wrong elimination). */
  lostKoRound: number | null;
  /** a not-completed fixture exists with this team as a CONFIRMED (resolved, non-placeholder) side. */
  hasConfirmedForwardFixture: boolean;
}

/** WHY a team is out. `no_forward_fixture` = neither lost a knockout nor failed its group, out only for
 *  want of a forward fixture (e.g. the CHAMPION after the final) - it has NO exit round. Absence and a
 *  floor are opposite facts, so this is encoded in the type, not a comment: a consumer must handle a
 *  null exitStage rather than silently read a floor label ("group") as a real result. */
export type EliminationReason = "lost_ko" | "failed_group" | "no_forward_fixture";

/** One eliminated team: the stage it exited at (null when it has no exit round, e.g. the champion), the
 *  short badge label ("" when there is no exit round), and WHY it is out. */
export interface EliminationFact {
  exitStage: ExitStage | null;
  label: string;
  reason: EliminationReason;
}

/** Results-derived elimination facts keyed by team name. Presence in the map = ELIMINATED (positive
 *  proof); a team ABSENT is treated as ALIVE (fail-open), mirroring surpriseIndex's results-facts flow. */
export type EliminationFacts = Map<string, EliminationFact>;

/** The three-condition results-primary predicate. */
export function isTeamAlive(f: TeamAliveFacts): boolean {
  const notLostKo = f.lostKoRound == null;
  // (group incomplete OR advancing): only a FAILED group verdict kills this clause; in_progress
  // (incomplete, or an undetermined best-third) and achieved both keep the team alive.
  const groupOk = f.advanceGroup !== "failed";
  return notLostKo && groupOk && f.hasConfirmedForwardFixture;
}

/** The exit stage + reason for an ELIMINATED team. A knockout loss gives the round it lost; a failed
 *  group gives "group". When a team is out ONLY for want of a forward fixture (it neither lost a KO nor
 *  failed its group, e.g. the champion after the final) it has NO exit round: return null + the
 *  `no_forward_fixture` reason so no consumer can read a floor as a real result (the old "group" floor
 *  is what mislabelled the champion "Group stage"). */
function exitOf(f: TeamAliveFacts): { exitStage: ExitStage | null; reason: EliminationReason } {
  if (f.lostKoRound != null) return { exitStage: KO_ROUND_EXIT[f.lostKoRound] ?? null, reason: "lost_ko" };
  if (f.advanceGroup === "failed") return { exitStage: "group", reason: "failed_group" };
  return { exitStage: null, reason: "no_forward_fixture" };
}

/** Reduce per-team facts to the eliminated-only facts map. An unentered (unmapped) team is skipped so
 *  it fails open; an alive team is skipped so it is never frozen. Deterministic: same facts -> same map. */
export function computeEliminations(facts: Iterable<TeamAliveFacts>): EliminationFacts {
  const out: EliminationFacts = new Map();
  for (const f of facts) {
    if (!f.entered) continue; // unmapped / not a real participant -> fail open (never frozen)
    if (isTeamAlive(f)) continue; // alive -> never frozen
    const { exitStage, reason } = exitOf(f);
    out.set(f.team, { exitStage, reason, label: exitStage ? EXIT_STAGE_LABEL[exitStage] : "" });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Forward-fixture confirmation (pure): which teams have a CONFIRMED, non-placeholder forward fixture.
// Split out so the placeholder / stale-bracket handling is unit-testable without the DB.
// ---------------------------------------------------------------------------------------------------

/** A fixture row as the forward-fixture check needs it. Group fixtures carry named participants from
 *  the start; knockout fixtures keep team_a/team_b NULL until the feeder resolves. */
export interface ForwardFixtureRow {
  matchId: string;
  status: string; // "completed" | scheduled/other
  teamA: string | null;
  teamB: string | null;
}

/** A knockout match's RESOLVED participants (from the current run's projected_bracket): a side is the
 *  real team name only when it resolved, else null (a placeholder side is never a real team here). */
export interface ResolvedKoSide {
  a: string | null;
  b: string | null;
}

/** The set of teams that have a CONFIRMED forward (not-yet-completed) fixture: a named participant of a
 *  scheduled group fixture, OR a RESOLVED side of a scheduled knockout fixture (from the projected
 *  bracket). A placeholder / unresolved side (null) is NEVER credited, so a transient next-round row
 *  cannot make a team look alive. Pure + deterministic. */
export function teamsWithForwardFixture(
  fixtures: ForwardFixtureRow[],
  koResolvedByMatch: Map<string, ResolvedKoSide>,
): Set<string> {
  const out = new Set<string>();
  for (const f of fixtures) {
    if (f.status === "completed") continue; // only a NOT-completed (forward) fixture counts
    if (f.teamA) out.add(f.teamA); // named group participant (confirmed from the start)
    if (f.teamB) out.add(f.teamB);
    const ko = koResolvedByMatch.get(f.matchId);
    if (ko) {
      if (ko.a) out.add(ko.a); // a RESOLVED knockout side; a placeholder side is null and skipped
      if (ko.b) out.add(ko.b);
    }
  }
  return out;
}

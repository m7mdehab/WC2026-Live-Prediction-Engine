// brackets domain - owned by the predict track. Types + pure, isomorphic logic for the /predict
// knockout picker (kept out of the shared lib/types.ts per the Wave 0 ownership convention).
//
// IMPORTANT: this module is CLIENT-SAFE - it has NO `server-only` import and reads no DB. The
// interactive picker (client) and the /api/predict validator (server) both import the same pure
// helpers below so the field seeding (§2.4) and the validation rules are byte-identical on both
// sides. Server-only DB reads live in lib/data/brackets.ts.
//
// Topology + slot codes are transcribed from data/knockout_slots_2026.json (read-only reference) -
// the same authoritative source the projected bracket and docs/bracket_submission_contract.md use.
// The contract keys knockout picks by the JSON's UN-padded ids (M73…M104) and r32_slots by the JSON
// slot codes (1X / 2X / best3_of_*); both are preserved verbatim here.

// ----------------------------------------------------------------------------------------------
// Picker options + group membership (used by the page + the server validator)
// ----------------------------------------------------------------------------------------------

/** One group's four teams, for the picker options. */
export interface PredictGroup {
  group_code: string;
  teams: { name: string; hostFlag: boolean }[];
}

/** Deterministic seeding inputs for the R32 field (§2.4), frozen from the source run. The client
 *  seeds the field reactively as group winners change; the server re-derives the same thing from
 *  canonical data so it never trusts the client's field. */
export interface SeedingInputs {
  /** group_code (A…L) -> the four teams in the model's projected finishing order (proj_rank 1→4).
   *  Retained as the projection-completeness gate (getSeedingInputs requires four ranked teams per
   *  group before the picker enables). Since v3 the user ranks 1st/2nd/3rd explicitly, so
   *  buildFieldSnapshot no longer derives runners-up/thirds from this order - only best3SlotToGroup
   *  is read there. Kept for the gate (+ a possible future "model order" hint). */
  groupOrder: Record<string, string[]>;
  /** best3 slot code (e.g. "best3_of_ABCDF") -> the group whose third-placed team the model
   *  assigned to it (Annex C). 8 entries - the qualifying-third groups, inherited from the run. */
  best3SlotToGroup: Record<string, string>;
}

/** Everything the /predict page needs to render the picker. */
export interface PredictOptions {
  /** The 12 groups (A…L), each with its four teams. */
  groups: PredictGroup[];
  /** The current forecast run the entry is pitted against (run link + field_snapshot source). */
  runId: string | null;
  runModelVersion: string | null;
  /** R32 seeding inputs from the current run; null if no published projection (picker disabled). */
  seeding: SeedingInputs | null;
}

/** Canonical group membership for server-side validation (never trust the client's options). */
export interface GroupMembership {
  /** group_code -> the four valid team names. */
  byGroup: Record<string, string[]>;
  /** all 48 valid team names. */
  all: string[];
}

// ----------------------------------------------------------------------------------------------
// v2/v3 full-bracket payload (docs/bracket_submission_contract.md §2, §2.5)
// ----------------------------------------------------------------------------------------------

/** The frozen R32 field the user picked against - lets a reader reconstruct the bracket months
 *  later without re-running the model. EXACTLY 32 r32_slots keys (12 `1X` + 12 `2X` + 8 best3). */
export interface FieldSnapshot {
  source_run_id: string;
  /** R32 slot code (1X / 2X / best3_of_*) -> the team occupying it. */
  r32_slots: Record<string, string>;
}

/** One group's user-ranked top three (v3). The 4th team is implicitly eliminated. The three are
 *  distinct members of that group; `first` is also written to `group_winners[X]` (v2 compatibility). */
export interface GroupStanding {
  first: string;
  second: string;
  third: string;
}

/**
 * The jsonb `bracket` payload stored on bracket_submissions (schema_version 3). No DDL - everything
 * lives inside the existing jsonb (RLS only checks jsonb_typeof = object). champion_pick / email /
 * consent / linkedin stay as their own columns.
 *
 * v3 adds `group_standings` (ranked 1st/2nd/3rd per group). `group_winners` is RETAINED (= each
 * group's `first`) so the AI-vs-Humans reader keeps working unchanged on the dimensions it scores.
 */
export interface BracketPayload {
  schema_version: 3;
  /** Required, server-trimmed. Lives in the jsonb (no display_name column). */
  display_name: string;
  /** The current run at submission time; null only if no run is published yet. */
  prediction_run_id: string | null;
  /** group_code (A…L) -> the user's ranked 1st/2nd/3rd for that group (NEW in v3). 12 entries. */
  group_standings: Record<string, GroupStanding>;
  /** group_code (A…L) -> the picked winner (= group_standings[X].first). Retained for v2 readers. */
  group_winners: Record<string, string>;
  /** The user's knockout winner picks, keyed by the un-padded match id (M73…M104, no M103).
   *  31 entries when complete: 16 R32 + 8 R16 + 4 QF + 2 SF + 1 Final. */
  knockout_picks: Record<string, string>;
  /** The frozen R32 field (§2.4) the picks were made against. */
  field_snapshot: FieldSnapshot;
}

/** POST /api/predict request body. The client sends its picks; the server re-derives the
 *  field_snapshot from canonical data (it does not trust a client-supplied field). */
export interface BracketSubmission {
  display_name: string;
  email?: string | null;
  consent_to_updates?: boolean;
  linkedin_url?: string | null;
  /** = knockout_picks["M104"], the Final winner. Re-checked server-side. */
  champion_pick: string;
  /** group_code -> ranked 1st/2nd/3rd; must cover all 12 groups with three distinct valid members
   *  each. The server derives group_winners (= each group's first) from this - never trusts a
   *  client-supplied winners map. */
  group_standings: Record<string, GroupStanding>;
  /** un-padded match id -> winner team name (M73…M104, no M103). */
  knockout_picks: Record<string, string>;
}

/** POST /api/predict response. `fields` maps a form field name -> a human error message. */
export type SubmitResponse =
  | { ok: true }
  | { ok: false; error: string; fields?: Record<string, string> };

// ----------------------------------------------------------------------------------------------
// Knockout topology - transcribed from data/knockout_slots_2026.json (un-padded ids)
// ----------------------------------------------------------------------------------------------

/** The 12 group codes A…L. */
export const GROUP_CODES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

/** The 8 best-third slot codes (Annex C), in knockout_slots order. */
export const BEST3_SLOTS = [
  "best3_of_ABCDF",
  "best3_of_CDFGH",
  "best3_of_CEFHI",
  "best3_of_EHIJK",
  "best3_of_BEFIJ",
  "best3_of_AEHIJ",
  "best3_of_EFGIJ",
  "best3_of_DEIJL",
] as const;

/** One R32 tie: its two slot codes (1X / 2X / best3_of_*). */
export interface R32Match {
  id: string;
  a: string;
  b: string;
}

/** R32 ties M73–M88 (slot codes verbatim from knockout_slots_2026.json.round_of_32). */
export const R32_MATCHES: R32Match[] = [
  { id: "M73", a: "2A", b: "2B" },
  { id: "M74", a: "1E", b: "best3_of_ABCDF" },
  { id: "M75", a: "1F", b: "2C" },
  { id: "M76", a: "1C", b: "2F" },
  { id: "M77", a: "1I", b: "best3_of_CDFGH" },
  { id: "M78", a: "2E", b: "2I" },
  { id: "M79", a: "1A", b: "best3_of_CEFHI" },
  { id: "M80", a: "1L", b: "best3_of_EHIJK" },
  { id: "M81", a: "1D", b: "best3_of_BEFIJ" },
  { id: "M82", a: "1G", b: "best3_of_AEHIJ" },
  { id: "M83", a: "2K", b: "2L" },
  { id: "M84", a: "1H", b: "2J" },
  { id: "M85", a: "1B", b: "best3_of_EFGIJ" },
  { id: "M86", a: "1J", b: "2H" },
  { id: "M87", a: "1K", b: "best3_of_DEIJL" },
  { id: "M88", a: "2D", b: "2G" },
];

/** One later-round tie: its two feeder match ids (each side is the WINNER of that feeder). */
export interface KOMatch {
  id: string;
  feeders: [string, string];
  round: "R16" | "QF" | "SF" | "Final";
}

/** R16 → Final, with W## edges resolved to feeder match ids (verbatim from knockout_slots). */
export const KO_MATCHES: KOMatch[] = [
  { id: "M89", feeders: ["M74", "M77"], round: "R16" },
  { id: "M90", feeders: ["M73", "M75"], round: "R16" },
  { id: "M91", feeders: ["M76", "M78"], round: "R16" },
  { id: "M92", feeders: ["M79", "M80"], round: "R16" },
  { id: "M93", feeders: ["M83", "M84"], round: "R16" },
  { id: "M94", feeders: ["M81", "M82"], round: "R16" },
  { id: "M95", feeders: ["M86", "M88"], round: "R16" },
  { id: "M96", feeders: ["M85", "M87"], round: "R16" },
  { id: "M97", feeders: ["M89", "M90"], round: "QF" },
  { id: "M98", feeders: ["M93", "M94"], round: "QF" },
  { id: "M99", feeders: ["M91", "M92"], round: "QF" },
  { id: "M100", feeders: ["M95", "M96"], round: "QF" },
  { id: "M101", feeders: ["M97", "M98"], round: "SF" },
  { id: "M102", feeders: ["M99", "M100"], round: "SF" },
  { id: "M104", feeders: ["M101", "M102"], round: "Final" },
];

export const FINAL_ID = "M104";

/** All 31 knockout match ids in round order (M73…M104, no M103). */
export const ALL_KO_IDS: string[] = [
  ...R32_MATCHES.map((m) => m.id),
  ...KO_MATCHES.map((m) => m.id),
];

const R32_BY_ID = new Map(R32_MATCHES.map((m) => [m.id, m]));
const KO_BY_ID = new Map(KO_MATCHES.map((m) => [m.id, m]));

export type Round = "R32" | "R16" | "QF" | "SF" | "Final";

export const ROUND_OF: Record<string, Round> = (() => {
  const r: Record<string, Round> = {};
  for (const m of R32_MATCHES) r[m.id] = "R32";
  for (const m of KO_MATCHES) r[m.id] = m.round;
  return r;
})();

export const ROUND_LABEL: Record<Round, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  Final: "Final",
};

// ----------------------------------------------------------------------------------------------
// Pure logic - field seeding (§2.4), participant resolution, pruning, champion path
// ----------------------------------------------------------------------------------------------

/**
 * Build the R32 field_snapshot from the user's 12 ranked group standings + the run's best-third slot
 * assignment (§2.5, v3). For each group X: `1X` = the user's 1st, `2X` = the user's 2nd; the user's
 * 3rd is that group's third-placed team. Best-thirds inherit the model's qualifying-group → slot
 * mapping (Annex C, `seeding.best3SlotToGroup`) and substitute the user's 3rd for each qualifying
 * group - the 3rds of the four non-qualifying groups are dropped (they don't advance).
 *
 * Returns null if any group's 1st/2nd/3rd is missing or not three distinct teams, or if the run's
 * best3 assignment is incomplete (the picker only seeds once all 12 groups are fully ranked). For a
 * valid, complete input the 32 occupants are always distinct: groups are disjoint, each group
 * contributes distinct 1X/2X/3X teams, and the 8 best3 groups are distinct - so Rule 4 holds for ANY
 * valid ranking (contract §2.5). Group membership is validated upstream (server: against canonical
 * teams; client: only that group's teams are tappable), so this transform checks shape only.
 */
export function buildFieldSnapshot(
  standings: Record<string, GroupStanding>,
  seeding: SeedingInputs,
  sourceRunId: string
): FieldSnapshot | null {
  const r32_slots: Record<string, string> = {};
  const thirdByGroup: Record<string, string> = {};

  for (const g of GROUP_CODES) {
    const s = standings[g];
    if (!s) return null;
    const { first, second, third } = s;
    if (!first || !second || !third) return null;
    if (first === second || first === third || second === third) return null;
    r32_slots[`1${g}`] = first;
    r32_slots[`2${g}`] = second;
    thirdByGroup[g] = third;
  }

  // best-thirds: inherit the model's qualifying-group → slot assignment (Annex C), substitute the
  // user's 3rd for each qualifying group. The user's 3rds for non-qualifying groups are dropped.
  for (const slot of BEST3_SLOTS) {
    const g = seeding.best3SlotToGroup[slot];
    if (!g || !thirdByGroup[g]) return null;
    r32_slots[slot] = thirdByGroup[g];
  }

  return { source_run_id: sourceRunId, r32_slots };
}

/**
 * The two teams in a match, given the seeded field + the user's picks so far. R32 sides come from
 * field_snapshot.r32_slots; later rounds come from the winner the user picked in each feeder. A
 * side is null when its feeder hasn't been decided yet.
 */
export function matchParticipants(
  matchId: string,
  r32_slots: Record<string, string>,
  picks: Record<string, string>
): [string | null, string | null] {
  const r32 = R32_BY_ID.get(matchId);
  if (r32) return [r32_slots[r32.a] ?? null, r32_slots[r32.b] ?? null];
  const ko = KO_BY_ID.get(matchId);
  if (ko) return [picks[ko.feeders[0]] ?? null, picks[ko.feeders[1]] ?? null];
  return [null, null];
}

/**
 * Drop any pick that is no longer one of its match's two participants - run after a group winner or
 * an earlier-round pick changes, so a stale downstream pick can't survive. Processed in round order
 * (R32 → Final) so upstream is already pruned when a downstream match is checked. Returns a new map.
 */
export function pruneInvalidPicks(
  picks: Record<string, string>,
  r32_slots: Record<string, string>
): Record<string, string> {
  const next = { ...picks };
  for (const id of ALL_KO_IDS) {
    const pick = next[id];
    if (pick == null) continue;
    const [a, b] = matchParticipants(id, r32_slots, next);
    if (pick !== a && pick !== b) delete next[id];
  }
  return next;
}

/** The champion = the Final pick (derived, no separate champion picker). Null until M104 is set. */
export function championOf(picks: Record<string, string>): string | null {
  return picks[FINAL_ID] ?? null;
}

/** Match ids on the champion's path: the matches the champion is a participant of (one per round).
 *  Empty until a Final winner exists. */
export function championPathIds(
  r32_slots: Record<string, string>,
  picks: Record<string, string>
): Set<string> {
  const champ = championOf(picks);
  const on = new Set<string>();
  if (!champ) return on;
  for (const id of ALL_KO_IDS) {
    const [a, b] = matchParticipants(id, r32_slots, picks);
    if (champ === a || champ === b) on.add(id);
  }
  return on;
}

/** All knockout picks present (31 ids, every later-round side resolved)? */
export function isKnockoutComplete(picks: Record<string, string>): boolean {
  return ALL_KO_IDS.every((id) => Boolean(picks[id]));
}

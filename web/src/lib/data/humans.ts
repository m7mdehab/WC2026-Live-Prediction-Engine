// AI-vs-Humans data layer - owned by the humans track. READ-ONLY: it never writes the DB.
//
// Responsibilities:
//   1. Inlines the frozen knockout topology from data/knockout_slots_2026.json (repo convention -
//      DesktopBracket and teamCodes inline their topology/maps rather than importing the root JSON,
//      which lives outside web/ and isn't on the bundler's module path; the topology is FIFA-frozen,
//      Regulations art. 12.6–12.11, captured 2026-06-02, so inlining is safe).
//   2. Reconstructs a human bracket from a submission (v2/v3: field_snapshot + keyed knockout picks,
//      per contract §2.3; v1: champion + 12 group winners only). v3 adds ranked group_standings but
//      reads identically here (it still carries group_winners + knockout_picks + field_snapshot).
//   3. Scores each bracket against a benchmark as ROUND-WEIGHTED set overlap. Set-based because the
//      human's group-winner picks reseed the R32 field (§2.4), so the human and model brackets hold
//      different teams in the same slot; advancement (who reached each round) is the apples-to-apples
//      unit, not a position-by-position winner comparison.
//   4. Reads the human bracket_submissions (service role - the table has no anon SELECT policy,
//      contract §1.1) + the model's projected bracket + champion odds, and aggregates crowd insights.
//
// Scoring is ACTUALS-ONLY (both modes), auto-detected from the source run (contract §4 / track brief):
//   the benchmark is the teams ACTUAL decided results have locked in (buildActualsBenchmark); an
//   undecided slot is PENDING (absent from the benchmark) so it contributes 0 and is NEVER scored
//   against the model's projection. The champion dimension is pending until an ACTUAL champion exists.
//   The model's own projected bracket is scored by this identical rule and ranked as ONE competitor
//   (scoreModelCompetitor). "projection" mode = pre-launch, nothing decided, every entry pending;
//   "results" mode = the run is conditioned / slots have begun to resolve, so decided slots carry
//   points and the rest stay pending. Scores are PROVISIONAL until all 31 matches decide
//   (ComparisonData.provisional).
//
// Offline/dev: AIVH_DEMO=1 renders a deterministic fixture (full crowd); AIVH_DEMO=low renders the
// low-N fallback; AIVH_DEMO=results renders the full crowd in hybrid results mode. Mirrors the
// FORECAST_DEMO pattern so the page builds + screenshots without Supabase.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// V2/V3 WRITER CONTRACT - the exact `bracket` jsonb shape this reader requires from the picker (the
// /predict track must match this BYTE-FOR-BYTE; this is the integration seam, mirroring
// docs/bracket_submission_contract.md §2, §2.5):
//   • schema_version: 2 or 3 (reader branches on >= 2; v3 reads identically to v2 here)
//   • display_name: string (the only PII-adjacent field read; trimmed)
//   • prediction_run_id: string | null
//   • group_winners:  { "A".."L": teamName }           (12 entries; v3 keeps this = each group's 1st)
//   • knockout_picks: { "M73".."M104": teamName }  - keyed by the UN-PADDED match id; the value is the
//       picked WINNER of that match; "M104" = the champion (no "M103"). 31 entries.
//   • field_snapshot.r32_slots: { slotCode: teamName }  - keyed by SLOT CODE (1A/2A/…/best3_of_XYZ),
//       NOT by match id; the 32 R32 occupants.
//   • field_snapshot.source_run_id: string  - the run the snapshot was seeded from.
//   • group_standings (v3 only): { "A".."L": { first, second, third } } - ADDITIVE. Captured for a
//       future 2nd/3rd-accuracy dimension; NOT scored yet, so a v3 entry scores exactly like its v2
//       equivalent (group winners + R32→Final + champion).
// Anything outside this whitelist (notably PII columns) is NEVER read - see getComparisonData().
// ─────────────────────────────────────────────────────────────────────────────────────────────────
import "server-only";
import { unstable_cache } from "next/cache";
import { getCurrentForecast, getPreTournamentBracket, getProjectedBracket } from "@/lib/data";
import { createServiceSupabase, hasServiceRole } from "@/lib/supabase/service";
import { isSeasonFrozen, FROZEN_TTL_SECONDS, ORACLE_BUILD } from "@/lib/data/freeze";
import { selectAll } from "@/lib/data/paginate";
import type { BracketMatch, ProjectedBracket } from "@/lib/types";
import type {
  Benchmark, BracketScore, ComparisonData, CrowdInsights, HumanEntry, ModelBenchmark,
  RawBracketPayload, ReachSets, ReconstructedBracket, RoundDef, ScoringMode,
} from "@/lib/types/humans";

// ===================================================================================================
// Knockout topology (un-padded ids M73…M104, exactly as the submission jsonb keys them; the
// projected_bracket DB table is zero-padded M073…M104 - normalized via padId(). Third-place playoff
// M103 is intentionally excluded - consolation, off the champion path, contract §1.3).
// ===================================================================================================

/** R32 match → its two slot codes (group-position / best-third), as in knockout_slots_2026.json. */
export const R32_SLOTS: Record<string, [string, string]> = {
  M73: ["2A", "2B"], M74: ["1E", "best3_of_ABCDF"], M75: ["1F", "2C"], M76: ["1C", "2F"],
  M77: ["1I", "best3_of_CDFGH"], M78: ["2E", "2I"], M79: ["1A", "best3_of_CEFHI"],
  M80: ["1L", "best3_of_EHIJK"], M81: ["1D", "best3_of_BEFIJ"], M82: ["1G", "best3_of_AEHIJ"],
  M83: ["2K", "2L"], M84: ["1H", "2J"], M85: ["1B", "best3_of_EFGIJ"], M86: ["1J", "2H"],
  M87: ["1K", "best3_of_DEIJL"], M88: ["2D", "2G"],
};

/** R16→Final match → its two feeder match ids (the W## edges). */
export const KO_FEEDERS: Record<string, [string, string]> = {
  M89: ["M74", "M77"], M90: ["M73", "M75"], M91: ["M76", "M78"], M92: ["M79", "M80"],
  M93: ["M83", "M84"], M94: ["M81", "M82"], M95: ["M86", "M88"], M96: ["M85", "M87"],
  M97: ["M89", "M90"], M98: ["M93", "M94"], M99: ["M91", "M92"], M100: ["M95", "M96"],
  M101: ["M97", "M98"], M102: ["M99", "M100"],
  M104: ["M101", "M102"],
};

/** Match ids per knockout round (the 31 scorable matches; M103 excluded). */
export const ROUND_MATCH_IDS = {
  r32: Object.keys(R32_SLOTS),                                   // 16 → winners reach R16
  r16: ["M89", "M90", "M91", "M92", "M93", "M94", "M95", "M96"], // 8  → reach QF
  qf: ["M97", "M98", "M99", "M100"],                             // 4  → reach SF
  sf: ["M101", "M102"],                                          // 2  → reach Final (finalists)
  final: ["M104"],                                               // 1  → champion
} as const;

export const GROUP_CODES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

const ALL_KO_IDS = [
  ...ROUND_MATCH_IDS.r32, ...ROUND_MATCH_IDS.r16, ...ROUND_MATCH_IDS.qf,
  ...ROUND_MATCH_IDS.sf, ...ROUND_MATCH_IDS.final,
];

// ===================================================================================================
// Scoring rubric - transparent, round-weighted, no upset-weighting (advanced leaderboard scoring is
// V2, scope_lock §4). Points rise each round so deeper correct calls are worth more.
// ===================================================================================================
export const RUBRIC: RoundDef[] = [
  { key: "group", label: "Group winner", per: 1, slots: 12, blurb: "each of the 12 group winners" },
  { key: "r32", label: "Round of 32", per: 2, slots: 16, blurb: "each team you advance to the Round of 16" },
  { key: "r16", label: "Round of 16", per: 4, slots: 8, blurb: "each team you advance to the quarter-finals" },
  { key: "qf", label: "Quarter-final", per: 8, slots: 4, blurb: "each team you advance to the semi-finals" },
  { key: "sf", label: "Semi-final", per: 16, slots: 2, blurb: "each finalist you call" },
  { key: "champion", label: "Champion", per: 32, slots: 1, blurb: "the champion" },
];
const PTS = Object.fromEntries(RUBRIC.map((r) => [r.key, r.per])) as Record<RoundDef["key"], number>;

/** Below this many submissions we show the model bracket as the benchmark, not thin crowd stats. */
export const LOW_N_THRESHOLD = 5;

// ===================================================================================================
// Reconstruction (contract §2.3)
// ===================================================================================================

const winnersOf = (picks: Record<string, string>, ids: readonly string[]): string[] =>
  ids.map((id) => picks[id]).filter((t): t is string => typeof t === "string" && t.length > 0);

/**
 * Reconstruct a bracket from a raw submission payload + the champion_pick column.
 * - v2/v3: full reconstruction. R32 occupants from field_snapshot.r32_slots; R16→Final occupants from
 *   the user's own prior-round winners via the W## feeder edges. v3 adds ranked group_standings but
 *   reads identically here - it still carries group_winners + knockout_picks + field_snapshot. The
 *   branch is `schema_version >= 2`.
 * - v1: only champion + group winners recorded, so reach-sets above the group stage are empty and the
 *   bracket scores on the dimensions it carries (contract §4).
 */
export function reconstructBracket(payload: RawBracketPayload, championPick: string): ReconstructedBracket {
  const version = Number(payload.schema_version ?? 1);
  const groupWinners: Record<string, string> = {};
  for (const g of GROUP_CODES) {
    const w = payload.group_winners?.[g];
    if (typeof w === "string" && w) groupWinners[g] = w;
  }

  if (version < 2 || !payload.knockout_picks) {
    return {
      schemaVersion: version, groupWinners,
      reachR16: [], reachQF: [], reachSF: [], finalists: [],
      champion: championPick || null, matches: {},
    };
  }

  const picks = payload.knockout_picks;
  const r32 = payload.field_snapshot?.r32_slots ?? {};
  const matches: ReconstructedBracket["matches"] = {};

  for (const id of ROUND_MATCH_IDS.r32) {
    const [sa, sb] = R32_SLOTS[id];
    matches[id] = { a: r32[sa] ?? null, b: r32[sb] ?? null, winner: picks[id] ?? null };
  }
  for (const id of [...ROUND_MATCH_IDS.r16, ...ROUND_MATCH_IDS.qf, ...ROUND_MATCH_IDS.sf, ...ROUND_MATCH_IDS.final]) {
    const [fa, fb] = KO_FEEDERS[id];
    matches[id] = { a: picks[fa] ?? null, b: picks[fb] ?? null, winner: picks[id] ?? null };
  }

  return {
    schemaVersion: version,
    groupWinners,
    reachR16: winnersOf(picks, ROUND_MATCH_IDS.r32),
    reachQF: winnersOf(picks, ROUND_MATCH_IDS.r16),
    reachSF: winnersOf(picks, ROUND_MATCH_IDS.qf),
    finalists: winnersOf(picks, ROUND_MATCH_IDS.sf),
    champion: picks["M104"] ?? championPick ?? null,
    matches,
  };
}

// ===================================================================================================
// Scoring & overlap
// ===================================================================================================

const overlapCount = (a: string[], b: Set<string>): number => a.reduce((n, t) => n + (b.has(t) ? 1 : 0), 0);

export function toBenchmark(r: ReachSets): Benchmark {
  return {
    groupWinners: r.groupWinners,
    reachR16: new Set(r.reachR16), reachQF: new Set(r.reachQF),
    reachSF: new Set(r.reachSF), finalists: new Set(r.finalists),
    champion: r.champion,
  };
}

/**
 * Score a reconstructed human bracket against a benchmark. Overlap totals are the benchmark's set
 * sizes. For a v1 (groups-only) human bracket, knockout overlaps are 0/total and only the group-winner
 * + champion dimensions contribute to points & maxPoints - so a v1 entry is never penalised for
 * detail it never recorded.
 */
export function scoreBracket(human: ReconstructedBracket, bench: Benchmark): BracketScore {
  const groupTotal = Object.keys(bench.groupWinners).length;
  const groupHit = GROUP_CODES.reduce(
    (n, g) => n + (human.groupWinners[g] && human.groupWinners[g] === bench.groupWinners[g] ? 1 : 0), 0);

  const groupsOnly = human.schemaVersion < 2;
  const championHit = !!human.champion && human.champion === bench.champion;

  const r16 = overlapCount(human.reachR16, bench.reachR16);
  const qf = overlapCount(human.reachQF, bench.reachQF);
  const sf = overlapCount(human.reachSF, bench.reachSF);
  const fin = overlapCount(human.finalists, bench.finalists);

  let points = groupHit * PTS.group + (championHit ? PTS.champion : 0);
  let maxPoints = groupTotal * PTS.group + (bench.champion ? PTS.champion : 0);
  if (!groupsOnly) {
    points += r16 * PTS.r32 + qf * PTS.r16 + sf * PTS.qf + fin * PTS.sf;
    maxPoints += bench.reachR16.size * PTS.r32 + bench.reachQF.size * PTS.r16
      + bench.reachSF.size * PTS.qf + bench.finalists.size * PTS.sf;
  }

  return {
    groupWinners: { hit: groupHit, total: groupTotal },
    reachR16: { hit: r16, total: bench.reachR16.size },
    reachQF: { hit: qf, total: bench.reachQF.size },
    reachSF: { hit: sf, total: bench.reachSF.size },
    finalists: { hit: fin, total: bench.finalists.size },
    championHit, points, maxPoints, groupsOnly,
  };
}

// ===================================================================================================
// Model benchmark from projected_bracket
// ===================================================================================================

/** un-padded knockout id (M73…M104) → zero-padded projected_bracket id (M073…M104). */
const padId = (unpadded: string): string => `M${unpadded.slice(1).padStart(3, "0")}`;

/** A projected_bracket match is "decided" once both sides are fixed by completed results - the same
 *  notion BracketCell uses for a real, played-into fixture. */
const isDecided = (m: BracketMatch | undefined): boolean => !!m && m.a_resolved && m.b_resolved;

/** Teams occupying the given matches (BOTH sides, resolved or not). This feeds the MODEL'S OWN
 *  projected bracket (its prediction as a competitor) + the crowd-vs-model descriptives, NOT the
 *  scoring yardstick. A resolved side holds the actual team; an unresolved side holds the model's
 *  current projected occupant. The actuals-only SCORING benchmark uses resolvedOccupants instead. */
function occupants(matches: Record<string, BracketMatch>, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const m = matches[padId(id)];
    if (!m) continue;
    if (m.team_a) out.push(m.team_a);
    if (m.team_b) out.push(m.team_b);
  }
  return out;
}

/** Group winners = the `1X` slot occupants of the R32 matches. Hybrid rule as occupants(): a
 *  resolved `1X` side is the ACTUAL group winner; an unresolved one is the model's current pick. */
function modelGroupWinners(matches: Record<string, BracketMatch>): Record<string, string> {
  const gw: Record<string, string> = {};
  for (const id of ROUND_MATCH_IDS.r32) {
    const m = matches[padId(id)];
    if (!m) continue;
    const a = /^1([A-L])$/.exec(m.slot_a ?? "");
    const b = /^1([A-L])$/.exec(m.slot_b ?? "");
    if (a && m.team_a) gw[a[1]] = m.team_a;
    if (b && m.team_b) gw[b[1]] = m.team_b;
  }
  return gw;
}

/** The model's PROJECTED bracket (its prediction). This is the model's OWN bracket -- ranked as one
 *  competitor on the leaderboard and used for the crowd-vs-model descriptives -- NOT the scoring
 *  yardstick. Scoring is ACTUALS-ONLY (buildActualsBenchmark); so champion + reach sets stay the
 *  model's full projection regardless of how many results have decided. */
export function buildModelBenchmark(
  pb: ProjectedBracket, championProb: Record<string, number>,
): ModelBenchmark {
  const m = pb.matches;
  return {
    run: pb.run,
    runId: pb.run?.run_id ?? null,
    champion: pb.champion,
    finalists: occupants(m, ROUND_MATCH_IDS.final),
    reachSF: occupants(m, ROUND_MATCH_IDS.sf),
    reachQF: occupants(m, ROUND_MATCH_IDS.qf),
    reachR16: occupants(m, ROUND_MATCH_IDS.r16),
    groupWinners: modelGroupWinners(m),
    championProb,
  };
}

// ===================================================================================================
// ACTUALS-ONLY benchmark (the scoring yardstick). EVERY bracket -- human AND the model's own -- is
// scored ONLY against the teams ACTUAL decided results have locked in. An UNDECIDED slot is PENDING:
// it is absent from these sets, so it contributes 0 and is NEVER scored against the model's
// projection. As rounds decide, the sets fill and points lock to actuals.
// ===================================================================================================

/** Teams on RESOLVED sides only (the actual occupants known from completed results). An unresolved
 *  side is omitted entirely -- it is pending, not the model's projection. */
function resolvedOccupants(matches: Record<string, BracketMatch>, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const m = matches[padId(id)];
    if (!m) continue;
    if (m.a_resolved && m.team_a) out.push(m.team_a);
    if (m.b_resolved && m.team_b) out.push(m.team_b);
  }
  return out;
}

/** Actual group winners = the `1X` R32 sides that have RESOLVED to a known team (the group is decided).
 *  An unresolved `1X` side is omitted (pending). */
function resolvedGroupWinners(matches: Record<string, BracketMatch>): Record<string, string> {
  const gw: Record<string, string> = {};
  for (const id of ROUND_MATCH_IDS.r32) {
    const m = matches[padId(id)];
    if (!m) continue;
    const a = /^1([A-L])$/.exec(m.slot_a ?? "");
    const b = /^1([A-L])$/.exec(m.slot_b ?? "");
    if (a && m.a_resolved && m.team_a) gw[a[1]] = m.team_a;
    if (b && m.b_resolved && m.team_b) gw[b[1]] = m.team_b;
  }
  return gw;
}

/** The ACTUALS-ONLY benchmark: only teams decided results have locked in. Champion is the ACTUAL
 *  champion once the Final is decided, else null (pending) -- never the model's projected champion. */
export function buildActualsBenchmark(pb: ProjectedBracket): Benchmark {
  const m = pb.matches;
  const final = m[padId("M104")];
  return {
    groupWinners: resolvedGroupWinners(m),
    reachR16: new Set(resolvedOccupants(m, ROUND_MATCH_IDS.r16)),
    reachQF: new Set(resolvedOccupants(m, ROUND_MATCH_IDS.qf)),
    reachSF: new Set(resolvedOccupants(m, ROUND_MATCH_IDS.sf)),
    finalists: new Set(resolvedOccupants(m, ROUND_MATCH_IDS.final)),
    champion: isDecided(final) ? (final?.proj_winner ?? null) : null,
  };
}

// ===================================================================================================
// Scoring + crowd aggregation (shared by live + demo paths)
// ===================================================================================================

interface RawEntry { id: string; payload: RawBracketPayload; championPick: string; createdAt?: string | null }

/**
 * SCORING-ELIGIBILITY cutoff (contract §4, integrity). A bracket submitted AFTER the tournament's last
 * result was decided is a HINDSIGHT entry - it could have seen the champion - and must never score on
 * the AI-vs-humans board (nor pollute the crowd tallies). `cutoff` is the ISO timestamp of that last
 * result (the Final's entered_at, scoringCutoff below); `null` means the tournament is still unfinished,
 * so EVERY entry is eligible - a live entry legitimately predicts FUTURE matches, so there is no cutoff
 * to apply. An entry with NO timestamp is KEPT (fail-open: the /api/predict freeze guard is the primary
 * lock and this is defence-in-depth; excluding a null-timestamp row would risk dropping a legitimate
 * entry). Timestamps are compared as INSTANTS (Date.parse), never as raw strings, so a timezone-format
 * difference between the two timestamptz columns can never skew the boundary. Pure + exported so the
 * property is pinned by a structural test (test/humans_scoring_cutoff.mjs).
 */
export function eligibleForScoring<T extends { createdAt?: string | null }>(
  entries: T[],
  cutoff: string | null,
): T[] {
  if (!cutoff) return entries;
  const cut = Date.parse(cutoff);
  if (Number.isNaN(cut)) return entries; // an unparseable cutoff must never over-exclude
  return entries.filter((e) => {
    if (!e.createdAt) return true;
    const t = Date.parse(e.createdAt);
    return Number.isNaN(t) || t <= cut;
  });
}

/** Leaderboard order: actuals-only points desc, THEN the model FIRST WITHIN A POINTS TIE, then
 *  maxPoints desc, then a stable name/id tiebreak (so an all-pending board, where every entry is 0,
 *  still renders in a deterministic order). The model-first rule is a tiebreak BELOW points: it fires
 *  ONLY between two entries on the EXACT same points, so any strictly higher score always outranks the
 *  model (the pin is intra-tie only). Exported for the tie/pin tests. */
export const byScore = (a: HumanEntry, b: HumanEntry): number =>
  b.score.points - a.score.points
  || (a.isModel === b.isModel ? 0 : a.isModel ? -1 : 1) // model first, but only within a points tie
  || b.score.maxPoints - a.score.maxPoints
  || a.displayName.localeCompare(b.displayName)
  || a.id.localeCompare(b.id);

/** Standard competition ranking ("1,1,1,4,...") over entries ALREADY sorted by byScore: every entry
 *  sharing the top (or any) points value gets the SAME displayed rank, and the next distinct points
 *  value resumes at (index + 1). This keeps the model pin HONEST: the model and any humans on its exact
 *  score render as JOINT-Nth (a shared rank number), never the model as a solo rank above humans on the
 *  same score. Ranking is by POINTS ONLY (the intra-tie model-first / name order does not change the
 *  shared rank number). Returns one displayed rank per entry, index-aligned to the input. */
export function tieAwareRanks(entries: HumanEntry[]): number[] {
  const ranks: number[] = [];
  let lastPoints: number | null = null;
  let lastRank = 0;
  entries.forEach((e, i) => {
    if (lastPoints === null || e.score.points !== lastPoints) {
      lastRank = i + 1; // first of a new points value: standard competition rank = position
      lastPoints = e.score.points;
    }
    ranks.push(lastRank);
  });
  return ranks;
}

function scoreEntries(raw: RawEntry[], bench: Benchmark, modelChampion: string | null): HumanEntry[] {
  return raw
    .map((e) => {
      const recon = reconstructBracket(e.payload, e.championPick);
      const champion = recon.champion ?? e.championPick ?? "";
      return {
        id: e.id,
        displayName: (e.payload.display_name ?? "").trim() || "Anonymous",
        schemaVersion: recon.schemaVersion,
        champion,
        score: scoreBracket(recon, bench),
        agreesWithModelChampion: !!modelChampion && champion === modelChampion,
      };
    })
    .sort(byScore);
}

/** The MODEL'S own FROZEN PRE-TOURNAMENT bracket as ONE COMPETITOR, scored by the identical
 *  ACTUALS-ONLY rule. `frozenModel` is the argmax of the conditioned-on-0 projection (the bracket the
 *  model would have submitted before kickoff); it is NOT the live re-projection, so the model has no
 *  foresight. This is what makes the page a fair AI vs Humans: the model is a ranked entrant that
 *  committed once, not the yardstick. Exported for the freeze-invariance test. */
export function scoreModelCompetitor(frozenModel: ModelBenchmark, bench: Benchmark): HumanEntry {
  const recon: ReconstructedBracket = {
    schemaVersion: 2,
    groupWinners: frozenModel.groupWinners,
    reachR16: frozenModel.reachR16, reachQF: frozenModel.reachQF, reachSF: frozenModel.reachSF,
    finalists: frozenModel.finalists, champion: frozenModel.champion, matches: {},
  };
  return {
    id: "__model__",
    displayName: "Presaira model",
    schemaVersion: 2,
    champion: frozenModel.champion ?? "",
    score: scoreBracket(recon, bench),
    agreesWithModelChampion: true,
    isModel: true,
  };
}

function tally(values: string[], total: number, top: number): { team: string; count: number; share: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([team, count]) => ({ team, count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team))
    .slice(0, top);
}

function buildCrowd(entries: HumanEntry[], recon: Map<string, ReachSets>, model: ModelBenchmark): CrowdInsights {
  const total = entries.length;
  const champions = tally(entries.map((e) => e.champion), total, 6);

  const finalistPicks: string[] = [];
  for (const e of entries) finalistPicks.push(...(recon.get(e.id)?.finalists ?? []));
  const finalists = finalistPicks.length ? tally(finalistPicks, total, 6) : null;

  // COMBINED most-picked (B.2): one row per team carrying BOTH its finalist (reach-the-final) and
  // champion pick counts/shares, sorted finalist desc then champion desc. Built from the same tallies.
  const finByTeam = new Map(tally(finalistPicks, total, 48).map((t) => [t.team, t]));
  const champByTeam = new Map(tally(entries.map((e) => e.champion), total, 48).map((t) => [t.team, t]));
  const mostPicked = [...new Set([...finByTeam.keys(), ...champByTeam.keys()])]
    .map((team) => {
      const f = finByTeam.get(team);
      const c = champByTeam.get(team);
      return {
        team,
        finalistCount: f?.count ?? 0, finalistShare: f?.share ?? 0,
        champCount: c?.count ?? 0, champShare: c?.share ?? 0,
      };
    })
    .sort((a, b) =>
      b.finalistCount - a.finalistCount || b.champCount - a.champCount || a.team.localeCompare(b.team))
    .slice(0, 8);

  const shareWithModelChampion = total
    ? entries.filter((e) => e.agreesWithModelChampion).length / total
    : 0;

  // Biggest crowd-vs-model title disagreement: max |crowd champion-share − model champion prob| over
  // every team either the crowd or the model backs. Signed delta shows the direction.
  let biggestDisagreement: CrowdInsights["biggestDisagreement"] = null;
  const allShare = new Map(tally(entries.map((e) => e.champion), total, 48).map((c) => [c.team, c.share]));
  const teams = new Set<string>([...allShare.keys(), ...Object.keys(model.championProb)]);
  for (const team of teams) {
    const crowdShare = allShare.get(team) ?? 0;
    const modelProb = model.championProb[team] ?? 0;
    const delta = crowdShare - modelProb;
    if (!biggestDisagreement || Math.abs(delta) > Math.abs(biggestDisagreement.delta)) {
      biggestDisagreement = { team, crowdShare, modelProb, delta };
    }
  }

  return {
    total,
    v1Count: entries.filter((e) => e.schemaVersion < 2).length,
    v2Count: entries.filter((e) => e.schemaVersion >= 2).length,
    champions, finalists, mostPicked, shareWithModelChampion, biggestDisagreement,
  };
}

/** Assemble the full view-model. Scoring is ACTUALS-ONLY (`actualsBench`). The model's LIVE projection
 *  (`model`) drives ONLY the descriptive crowd-vs-model comparison + the agrees-with-model pill; the
 *  model's FROZEN pre-tournament bracket (`frozenModel`) is the ranked competitor
 *  (scoreModelCompetitor). Neither is the scoring yardstick. */
function assemble(
  model: ModelBenchmark | null, frozenModel: ModelBenchmark | null, actualsBench: Benchmark | null,
  raw: RawEntry[], mode: ScoringMode, decided: number | null, demo: boolean,
): ComparisonData {
  const humanEntries = actualsBench && model ? scoreEntries(raw, actualsBench, model.champion) : [];
  // The model COMPETITOR is its FROZEN pre-tournament bracket (frozenModel), NOT the live projection -
  // so the live re-projection can never change the model's score. If NO cond0 reference exists we do
  // NOT fall back to the live (hindsight) bracket: that would unfairly score the model with foresight.
  // Instead the competitor is DROPPED from the leaderboard and the card shows a visible "unavailable"
  // state (frozenUnavailable). The live `model` is still used ONLY for the descriptive crowd-vs-model
  // comparison, never as a scored entry.
  const competitor = frozenModel; // never `?? model` - no silent foresight bracket
  const frozenUnavailable = competitor === null && model !== null;
  const modelEntry = actualsBench && competitor ? scoreModelCompetitor(competitor, actualsBench) : null;
  // AI vs Humans: the model is ranked AMONG the humans by the same actuals-only rule.
  const entries = [...humanEntries, ...(modelEntry ? [modelEntry] : [])].sort(byScore);
  const lowN = humanEntries.length < LOW_N_THRESHOLD;

  let crowd: CrowdInsights | null = null;
  if (!lowN && model) {
    const reconMap = new Map<string, ReachSets>(
      raw.map((e) => [e.id, reconstructBracket(e.payload, e.championPick)]),
    );
    crowd = buildCrowd(humanEntries, reconMap, model); // crowd tallies are HUMANS only (the model is one entrant)
  }

  // Provisional until every knockout match is decided: undecided slots are pending and lock to actuals
  // as results arrive, so points still move. (Additive field.)
  const provisional = mode === "results" && (decided ?? 0) < ALL_KO_IDS.length;

  return {
    mode, lowN, threshold: LOW_N_THRESHOLD, demo, model, frozenModel: competitor, frozenUnavailable,
    entries, crowd, rubric: RUBRIC, decided, provisional,
  };
}

// ===================================================================================================
// Public entry point
// ===================================================================================================

/**
 * Rebuild a RawBracketPayload from ONLY the whitelisted v2 keys (see the "V2 WRITER CONTRACT" block
 * at the top of this file). Anything else on the stored jsonb - including any PII a future writer bug
 * might smuggle in - is dropped here and can never flow into the client-bound view-model.
 */
function whitelistPayload(bracket: unknown): RawBracketPayload {
  const b = (bracket ?? {}) as Record<string, unknown>;
  const fs = (b.field_snapshot ?? {}) as Record<string, unknown>;
  return {
    schema_version: b.schema_version as RawBracketPayload["schema_version"],
    display_name: b.display_name as RawBracketPayload["display_name"],
    prediction_run_id: b.prediction_run_id as RawBracketPayload["prediction_run_id"],
    group_winners: b.group_winners as RawBracketPayload["group_winners"],
    // v3 (additive; server-side only - never client-bound). Kept on the whitelist so a future
    // 2nd/3rd-accuracy pass has it; it carries only team names, no PII.
    group_standings: b.group_standings as RawBracketPayload["group_standings"],
    knockout_picks: b.knockout_picks as RawBracketPayload["knockout_picks"],
    field_snapshot: b.field_snapshot
      ? {
          source_run_id: fs.source_run_id as string | undefined,
          r32_slots: fs.r32_slots as Record<string, string> | undefined,
        }
      : undefined,
  };
}

/**
 * The scoring cutoff INSTANT: the Final's result timestamp once the Final (M104) has been decided, else
 * null. A bracket created after this saw the champion and is excluded (eligibleForScoring). The Final's
 * entered_at - NOT max(entered_at) across all results - is the correct line: it is the exact moment the
 * champion became known, so it excludes every post-Final hindsight entry while a LATER score correction
 * to an earlier match can never widen the window and re-admit one. Read is fail-soft: a missing Final row
 * (tournament unfinished) or any error returns null, so a blip only ever leaves entries eligible, never
 * over-excludes. match_results.match_id is the un-padded-equivalent id ("M104" here) - padId normalizes it.
 */
async function scoringCutoff(sb: ReturnType<typeof createServiceSupabase>): Promise<string | null> {
  try {
    const { data, error } = await sb
      .from("match_results")
      .select("entered_at")
      .eq("match_id", padId("M104"))
      .limit(1);
    if (error || !data?.length) return null;
    return (data[0] as { entered_at: string | null }).entered_at ?? null;
  } catch {
    return null;
  }
}

/**
 * Read + integrity-filter the human submissions for scoring. Isolated so its caching can be gated on the
 * season: it is the ONE uncached read on /predict, so leaving it uncached forces the route dynamic.
 * PII (email/consent/linkedin) is intentionally NOT selected; created_at is a timestamp for the cutoff.
 * whitelistPayload rebuilds the payload from only the known keys, so no stray jsonb key reaches the
 * client. Fails soft to [] (no service role, or any read error) exactly like the inline read it replaces.
 */
async function readCrowdRaw(): Promise<RawEntry[]> {
  if (!hasServiceRole()) return [];
  const sb = createServiceSupabase();
  // PAGINATE: bracket_submissions is GROWTH-PRONE (one row per public entry, unbounded), so a plain
  // full-table select would silently truncate the crowd past PostgREST's 1000-row cap. selectAll pages
  // through .range preserving the created_at ordering; it fails soft to [].
  const data = await selectAll<{ id: number | string; champion_pick: string; bracket: unknown; created_at: string | null }>(
    sb, "bracket_submissions", "id, champion_pick, bracket, created_at",
    (q) => q.order("created_at", { ascending: true }),
  );
  const all: RawEntry[] = data.map((row) => ({
    id: String(row.id),
    payload: whitelistPayload(row.bracket),
    championPick: row.champion_pick,
    createdAt: row.created_at,
  }));
  // INTEGRITY (contract §4): once the Final has decided, drop any entry submitted AFTER it - a
  // post-tournament hindsight bracket that could have seen the champion must never score, nor feed the
  // crowd tallies. scoringCutoff is null while the tournament is unfinished (live entries stay eligible).
  return eligibleForScoring(all, await scoringCutoff(sb));
}

export async function getComparisonData(): Promise<ComparisonData> {
  const demoMode = process.env.AIVH_DEMO;
  if (demoMode === "1" || demoMode === "low" || demoMode === "results") {
    return demoComparison(demoMode === "low", demoMode === "results" ? "results" : "projection");
  }

  let pb: ProjectedBracket | null = null;
  let preTournamentPb: ProjectedBracket | null = null;
  const championProb: Record<string, number> = {};
  try {
    const [bracket, forecast, preBracket] = await Promise.all([
      getProjectedBracket(), getCurrentForecast(), getPreTournamentBracket(),
    ]);
    pb = bracket;
    preTournamentPb = preBracket;
    if (forecast) for (const t of forecast.teamProbabilities) championProb[t.team] = t.champion ?? 0;
  } catch (err) {
    console.error("ai-vs-humans: model read failed:", err);
  }

  // Results mode once any slot is resolved by completed results (or the run is conditioned). Scoring
  // is actuals-only either way: with zero resolved slots the actuals benchmark is empty, so every
  // entry (and the model competitor) is pending/0 until results decide. `mode` only drives copy +
  // the provisional flag, not the benchmark.
  const matchVals = pb ? Object.values(pb.matches) : [];
  const anyResolved = matchVals.some((m) => m.a_resolved || m.b_resolved);
  const conditioned = (pb?.run?.conditioned_on_results ?? 0) > 0;
  const mode: ScoringMode = anyResolved || conditioned ? "results" : "projection";
  const decided = mode === "results"
    ? ALL_KO_IDS.filter((id) => isDecided(pb?.matches[padId(id)])).length
    : null;

  const hasBracket = pb !== null && Object.keys(pb.matches).length > 0;
  // The model's LIVE projection - for the DESCRIPTIVE crowd-vs-model comparison + the agrees-with-model
  // pill only (labeled "current projection" on the page), never the scored bracket.
  const model = pb !== null && hasBracket ? buildModelBenchmark(pb, championProb) : null;
  // The SCORING yardstick: actuals-only, from the LIVE run's resolved slots. Undecided slots pending.
  const actualsBench = pb !== null && hasBracket ? buildActualsBenchmark(pb) : null;
  // The model COMPETITOR's bracket: the FROZEN pre-tournament (cond0) argmax projection - the bracket
  // the model would have submitted before kickoff. NOT the live run, so it has no foresight. If the
  // cond0 reference is MISSING we return null (NOT the live model): assemble() then drops the model
  // competitor from the leaderboard and surfaces a visible "pre-tournament bracket unavailable" state.
  // We never silently substitute the live (hindsight) bracket as the scored competitor.
  const hasFrozen = preTournamentPb !== null && Object.keys(preTournamentPb.matches).length > 0;
  if (!hasFrozen && hasBracket) {
    console.warn("ai-vs-humans: no pre-tournament (cond0) bracket found; model competitor DROPPED (no foresight fallback), card shows unavailable");
  }
  const frozenModel = preTournamentPb !== null && hasFrozen
    ? buildModelBenchmark(preTournamentPb, championProb)
    : null;

  // Human submissions - service role only (no anon SELECT policy). Degrade to the benchmark state if the
  // service key isn't configured or the read fails; the page never hard-errors on this.
  //
  // STATIC SEAL (Track C): this crowd read is the ONE uncached read on /predict. When the season is
  // FROZEN the board is IMMUTABLE (submissions are closed by the /api/predict freeze guard), so we serve
  // it from the bounded Data Cache (7-day TTL, busted every deploy via ORACLE_BUILD) - that is what lets
  // /predict prerender as STATIC once the tournament is over. When LIVE we read per-request (uncached),
  // so a new entry appears immediately and the route stays dynamic. Gated on the isFrozen DATA predicate,
  // never a date, so a future live season reverts to per-request automatically. Fail-soft to [].
  let raw: RawEntry[] = [];
  try {
    raw = (await isSeasonFrozen())
      ? await unstable_cache(readCrowdRaw, ["aivh-crowd", ORACLE_BUILD], { revalidate: FROZEN_TTL_SECONDS })()
      : await readCrowdRaw();
  } catch (err) {
    console.error("ai-vs-humans: submissions read failed:", err);
  }

  return assemble(model, frozenModel, actualsBench, raw, mode, decided, false);
}

// ===================================================================================================
// Deterministic offline fixture (AIVH_DEMO). Synthesises a coherent model bracket + a handful of
// human entries (mixed v1/v2) so the page - overlap, round-weighted score, crowd insights, low-N -
// builds and screenshots without a live Supabase connection.
// ===================================================================================================

const DEMO_GW: Record<string, string> = {
  A: "Mexico", B: "Switzerland", C: "Brazil", D: "United States", E: "Germany", F: "Netherlands",
  G: "Belgium", H: "Spain", I: "France", J: "Argentina", K: "Portugal", L: "England",
};
const DEMO_R16 = [...Object.values(DEMO_GW), "Morocco", "Croatia", "Uruguay", "Colombia"]; // 16
const DEMO_QF = ["Brazil", "Germany", "Netherlands", "Spain", "France", "Argentina", "Portugal", "England"];
const DEMO_SF = ["Spain", "France", "Argentina", "Brazil"];
const DEMO_FINAL = ["Spain", "Argentina"];
const DEMO_CHAMP = "Spain";
const DEMO_CHAMP_PROB: Record<string, number> = {
  Spain: 0.18, Argentina: 0.14, France: 0.12, Brazil: 0.11, England: 0.09, Portugal: 0.07,
  Germany: 0.06, Netherlands: 0.05, Belgium: 0.03, Morocco: 0.025, Croatia: 0.02, Uruguay: 0.015,
};

/** Build a v2 raw payload from a compact spec (round winner lists become keyed knockout_picks). */
function demoV2(name: string, spec: {
  gw: Record<string, string>; r16: string[]; qf: string[]; sf: string[]; final: string[]; champ: string;
}): RawEntry {
  const picks: Record<string, string> = {};
  ROUND_MATCH_IDS.r32.forEach((id, i) => { if (spec.r16[i]) picks[id] = spec.r16[i]; });
  ROUND_MATCH_IDS.r16.forEach((id, i) => { if (spec.qf[i]) picks[id] = spec.qf[i]; });
  ROUND_MATCH_IDS.qf.forEach((id, i) => { if (spec.sf[i]) picks[id] = spec.sf[i]; });
  ROUND_MATCH_IDS.sf.forEach((id, i) => { if (spec.final[i]) picks[id] = spec.final[i]; });
  picks["M104"] = spec.champ;
  return {
    id: name, championPick: spec.champ,
    payload: {
      schema_version: 2, display_name: name, prediction_run_id: "demo",
      group_winners: spec.gw, knockout_picks: picks,
      field_snapshot: { source_run_id: "demo", r32_slots: {} },
    },
  };
}

function demoV1(name: string, gw: Record<string, string>, champ: string): RawEntry {
  return {
    id: name, championPick: champ,
    payload: { schema_version: 1, display_name: name, prediction_run_id: "demo", group_winners: gw },
  };
}

function demoComparison(lowN: boolean, mode: ScoringMode = "projection"): ComparisonData {
  const model: ModelBenchmark = {
    run: {
      run_id: "forecast__demo", created_at: "2026-06-08T00:00:00Z", model_version: "demo-fixture",
      simulator_version: "demo", code_version: null, git_commit: null, data_version: null,
      data_hash: null, rng_seed: null, training_cutoff_date: null, data_cutoff_time: null,
      calibration_method: null, run_type: "demo", iterations: 50000,
      conditioned_on_results: mode === "results" ? 2 : 0,
    },
    runId: "forecast__demo",
    champion: DEMO_CHAMP, finalists: DEMO_FINAL, reachSF: DEMO_SF, reachQF: DEMO_QF,
    reachR16: DEMO_R16, groupWinners: DEMO_GW, championProb: DEMO_CHAMP_PROB,
  };

  const adaGW = { ...DEMO_GW, B: "Croatia", G: "Egypt" };
  const ada = demoV2("Ada L.", {
    gw: adaGW, r16: DEMO_R16, qf: DEMO_QF, sf: DEMO_SF, final: ["Spain", "Brazil"], champ: "Spain",
  });
  const marcoGW = { ...DEMO_GW, A: "South Korea", I: "Senegal" };
  const marco = demoV2("Marco R.", {
    gw: marcoGW,
    r16: [...Object.values(marcoGW), "Japan", "Croatia", "Uruguay", "Ecuador"],
    qf: ["Brazil", "Germany", "Japan", "Spain", "Senegal", "Argentina", "Portugal", "England"],
    sf: ["Brazil", "Spain", "Argentina", "England"], final: ["Argentina", "England"], champ: "Argentina",
  });
  const lena = demoV2("Lena K.", {
    gw: DEMO_GW, r16: DEMO_R16, qf: DEMO_QF,
    sf: ["Spain", "Netherlands", "Argentina", "Brazil"], final: ["Spain", "Argentina"], champ: "Spain",
  });
  const priya = demoV1("Priya S.", { ...DEMO_GW, D: "Turkey", K: "Colombia" }, "France");
  const tom = demoV1("Tom B.", { ...DEMO_GW, L: "Croatia" }, "Spain");
  const nadia = demoV1("Nadia F.", { ...DEMO_GW, C: "Morocco", H: "Uruguay" }, "Brazil");

  const all: RawEntry[] = [ada, marco, lena, priya, tom, nadia];
  const raw = lowN ? all.slice(0, 2) : all;
  // results-mode demo: ACTUALS-ONLY mid-tournament. Pretend groups A-D have decided (winners locked)
  // and NO knockout match has, so the board shows real group points + pending knockout rounds (the
  // live actuals-only shape). projection-mode demo: nothing decided, every entry pending.
  // Demo: the fixed demo bracket doubles as both the live projection (descriptive) and the frozen
  // pre-tournament competitor (the offline fixture has no separate cond0 run).
  return assemble(model, model, demoActualsBenchmark(mode), raw, mode, mode === "results" ? 0 : null, true);
}

/** An empty actuals benchmark: nothing decided yet -> every bracket is pending (0 points). */
const EMPTY_BENCH: Benchmark = {
  groupWinners: {}, reachR16: new Set(), reachQF: new Set(), reachSF: new Set(),
  finalists: new Set(), champion: null,
};

/** Demo-only actuals benchmark. Mirrors the live shape: in results mode a handful of group winners
 *  have locked in and no knockout has, so the demo board exercises real group points + pending KO. */
function demoActualsBenchmark(mode: ScoringMode): Benchmark {
  if (mode !== "results") return EMPTY_BENCH;
  return {
    groupWinners: { A: DEMO_GW.A, B: DEMO_GW.B, C: DEMO_GW.C, D: DEMO_GW.D },
    reachR16: new Set(), reachQF: new Set(), reachSF: new Set(), finalists: new Set(), champion: null,
  };
}

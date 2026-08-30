// AI-vs-Humans domain types - owned by the humans track (per-track types module; the shared
// lib/types.ts is live-ops-only). Covers both the bracket reconstruction/scoring primitives and the
// page view-model. Runtime logic lives in lib/data/humans.ts.

import type { ModelPredictionRun } from "@/lib/types";

// ---- reconstruction / scoring primitives -----------------------------------------------------

/** The minimal v1/v2/v3 jsonb shape the reader consumes (a superset of all schema versions, contract §2/§2.5). */
export interface RawBracketPayload {
  schema_version?: number;
  display_name?: string;
  prediction_run_id?: string | null;
  group_winners?: Record<string, string>;
  // v3 only - the user's ranked 1st/2nd/3rd per group. Additive: captured for a future 2nd/3rd
  // accuracy dimension; NOT yet scored. A v3 entry scores exactly like its v2 equivalent.
  group_standings?: Record<string, { first: string; second: string; third: string }>;
  // v2+:
  knockout_picks?: Record<string, string>;
  field_snapshot?: {
    source_run_id?: string;
    r32_slots?: Record<string, string>;
  };
}

/** The set of teams a bracket advances to each round (advancement, position-independent). Group
 *  winners stay as a code→team map so the group-winner dimension can be compared per group. */
export interface ReachSets {
  groupWinners: Record<string, string>; // A…L → team (12; partial for malformed rows)
  reachR16: string[];                    // 16 R32 winners (empty for v1)
  reachQF: string[];                     // 8
  reachSF: string[];                     // 4
  finalists: string[];                   // 2
  champion: string | null;               // 1
}

/** A reconstructed human bracket: its reach-sets plus, for v2, the full per-match occupants. */
export interface ReconstructedBracket extends ReachSets {
  schemaVersion: number;
  /** match_id → { a, b, winner } for every reconstructed knockout match (v2 only; empty for v1). */
  matches: Record<string, { a: string | null; b: string | null; winner: string | null }>;
}

/** The benchmark's reach-sets pre-indexed as Sets for cheap intersection. */
export interface Benchmark {
  groupWinners: Record<string, string>;
  reachR16: Set<string>;
  reachQF: Set<string>;
  reachSF: Set<string>;
  finalists: Set<string>;
  champion: string | null;
}

/** A simple hit/total overlap counter. */
export interface OverlapStat {
  hit: number;
  total: number;
}

export interface BracketScore {
  groupWinners: OverlapStat;
  reachR16: OverlapStat;
  reachQF: OverlapStat;
  reachSF: OverlapStat;
  finalists: OverlapStat;
  championHit: boolean;
  /** round-weighted points earned, and the max attainable given the dimensions this bracket carries. */
  points: number;
  maxPoints: number;
  /** true when this bracket has no knockout detail (v1) - overlap above the group stage is N/A. */
  groupsOnly: boolean;
}

// ---- page view-model --------------------------------------------------------------------------

/** A round-weighted rubric line (shown in the page copy so the scheme is transparent). */
export interface RoundDef {
  key: "group" | "r32" | "r16" | "qf" | "sf" | "champion";
  label: string;
  per: number;   // points per correct slot
  slots: number; // number of such slots in a full bracket
  blurb: string; // human description for the rubric copy
}

/**
 * Whether the tournament has begun deciding results. ACTUALS-ONLY scoring (both modes): every bracket
 * is scored ONLY against the teams ACTUAL decided results have locked in; undecided slots are PENDING
 * and contribute 0 (never scored against the model's projection). "projection" = pre-launch, nothing
 * decided yet, so the leaderboard is all-pending; "results" = the run is conditioned / slots have
 * begun to resolve, so decided slots carry points and the rest stay pending. Auto-detected. The
 * model's own projected bracket is scored by this identical rule and ranked as one competitor.
 */
export type ScoringMode = "projection" | "results";

/** The benchmark every human bracket is compared to, in display form. */
export interface ModelBenchmark {
  run: ModelPredictionRun | null;
  runId: string | null;
  champion: string | null;
  finalists: string[];
  reachSF: string[];
  reachQF: string[];
  reachR16: string[];
  groupWinners: Record<string, string>;
  /** model champion probability per team (team_probabilities), for the crowd-vs-model disagreement. */
  championProb: Record<string, number>;
}

/** One entry on the leaderboard, scored against the actuals-only benchmark. Usually a human bracket;
 *  when isModel is true it is the MODEL'S own projected bracket, ranked as one competitor (AI vs
 *  Humans). The model entry is scored by the identical actuals-only rule. */
export interface HumanEntry {
  id: string;
  displayName: string;
  schemaVersion: number;
  champion: string;
  score: BracketScore;
  agreesWithModelChampion: boolean;
  /** ADDITIVE (optional so existing literals stay valid): the model's own bracket competitor. */
  isModel?: boolean;
}

/** Crowd aggregates (suppressed under the low-N threshold). */
export interface CrowdInsights {
  total: number;
  v1Count: number;
  v2Count: number;
  champions: { team: string; count: number; share: number }[];
  finalists: { team: string; count: number; share: number }[] | null;
  /** Combined MOST-PICKED card (B.2): one row per team carrying BOTH how often the crowd picked the
   *  team to REACH THE FINAL (finalist) and to be CHAMPION. Sorted finalist count desc, then champion
   *  count desc. Replaces the two separate champion/finalist cards. */
  mostPicked: {
    team: string;
    finalistCount: number; finalistShare: number;
    champCount: number; champShare: number;
  }[];
  shareWithModelChampion: number;
  biggestDisagreement: { team: string; crowdShare: number; modelProb: number; delta: number } | null;
}

/** The full view-model the /ai-vs-humans page renders. */
export interface ComparisonData {
  mode: ScoringMode;
  lowN: boolean;
  threshold: number;
  demo: boolean;
  /** The model's LIVE projection - DESCRIPTIVE only (the crowd-vs-model comparison + the
   *  agrees-with-model pill), labeled "current projection" on the page. NEVER the scored bracket. */
  model: ModelBenchmark | null;
  /** ADDITIVE (optional so existing literals stay valid): the model's FROZEN pre-tournament (cond0)
   *  bracket - the bracket the model competitor is actually SCORED on (its isModel leaderboard entry).
   *  The low-N "model bracket" card renders this so it matches the scored entry. Null (NOT a live
   *  fallback) when no cond0 reference exists; see frozenUnavailable. */
  frozenModel?: ModelBenchmark | null;
  /** ADDITIVE (optional so existing literals stay valid): true when the model has a LIVE projection but
   *  NO frozen pre-tournament (cond0) bracket, so the scored competitor was DROPPED from `entries`. The
   *  ModelBenchmark / low-N card renders a visible "pre-tournament bracket unavailable" state instead of
   *  silently re-introducing the live (foresight) bracket. Treat absent as false. */
  frozenUnavailable?: boolean;
  entries: HumanEntry[]; // sorted by points desc
  crowd: CrowdInsights | null; // null under low-N
  rubric: RoundDef[];
  decided: number | null; // results mode only
  /** ADDITIVE (optional so existing literals stay valid): true while results-mode points can still
   *  move because not every knockout match has decided (decided < 31) -- undecided rounds are pending
   *  and lock to actuals as results arrive. UI shows "provisional, locks in as results arrive".
   *  Treat absent as false. */
  provisional?: boolean;
}

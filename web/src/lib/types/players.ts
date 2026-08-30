// players types - owned by the players track. Domain types for the /players feature pages.
// Mirror db/schema_i_players.sql (players + player_match_stats + player_projections) and the
// players/artifacts (metric names). Public sports data only - no PII.

/** A tracked player's identity (public.players row, camelCased for the UI). */
export interface PlayerIdentity {
  id: string;
  name: string;
  nation: string;
  team: string | null;
  role: string | null;       // GK | DF | MF | FW
  subRole: string | null;    // e.g. center_forward, winger
  club: string | null;
  hasBaseline: boolean;
  tracked: boolean;
}

/** One projection metric for a player (public.player_projections row). */
export interface PlayerProjection {
  metric: string;            // expected_goals | expected_assists | ...
  expectedValue: number | null;
  bandLow: number | null;
  bandHigh: number | null;
}

/** One per-match actuals row (public.player_match_stats row), camelCased. */
export interface PlayerMatchStat {
  matchId: string;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  shots: number | null;
  xg: number | null;
  xa: number | null;
  passes: number | null;
  passCompletion: number | null;
  keyPasses: number | null;
  progressivePasses: number | null;
  duelsWon: number | null;
  saves: number | null;
  goalsConceded: number | null;
  cleanSheet: boolean | null;
  yellow: number | null;
  red: number | null;
  source: string;
  locked: boolean;
}

/** A row in the players index: identity + the headline projection + accumulated actuals, with the
 *  over/under-performance signal the index sorts/filters by.
 *
 *  DISPLAY contract: the index shows each player's STRONGEST actual contribution (their real standout)
 *  against the MATCHING expected, so a scorer is never hidden behind a zero role-headline. The
 *  display* fields drive the rendered cell, the colour tier, and the default sort; the goals/assists
 *  pairs are exposed additively so a cell can show both an honest "G" and "A" split. The original
 *  headline* fields are retained for backward compatibility (other sorts / cross-links). */
export interface PlayerIndexRow extends PlayerIdentity {
  /** The player's StatsBomb id (public.players.statsbomb_player_id), null for actuals-only players.
   *  Surfaced so the frozen pre-tournament projection bundle can join on it (the exact-integer key). */
  statsbombId: number | null;
  /** The role-appropriate headline metric name (e.g. expected_goals for FW), if projected. */
  headlineMetric: string | null;
  /** Projected value of the headline metric, if any. */
  headlineExpected: number | null;
  /** Actual count of the headline metric so far (e.g. goals), summed across logged matches. */
  headlineActual: number;
  /** Actual goals scored so far, summed across logged matches. */
  actualGoals: number;
  /** Projected expected_goals for this player, if projected. null = no projection (never fabricated). */
  expectedGoals: number | null;
  /** Actual assists so far, summed across logged matches. */
  actualAssists: number;
  /** Projected expected_assists for this player, if projected. null = no projection. */
  expectedAssists: number | null;
  /** As-played expected goals: the sum of per-match xg over the player's logged matches. A re-projection
   *  can never move it (recorded actuals, not a model output), so it FREEZES an eliminated player's
   *  "now" xG. null when no logged match carried an xg value (e.g. zero minutes played). */
  asPlayedXg: number | null;
  /** As-played expected assists: the sum of per-match xa over the logged matches. null when none carried xa. */
  asPlayedXa: number | null;
  /** Actual clean sheets so far (count of logged matches with clean_sheet=true). Keeper/defender column. */
  actualCleanSheets: number;
  /** Actual goals conceded so far, summed across logged matches. Keeper column. */
  actualGoalsConceded: number;
  /** Actual saves so far, summed across logged matches. Keeper column. */
  actualSaves: number;
  /** Projected expected_clean_sheets (the defensive value projection), if projected. null = no projection. */
  expectedCleanSheets: number | null;
  /** Projected expected_goals_prevented (the GK shot-stopping rank-fusion metric), if projected. null = none. */
  expectedGoalsPrevented: number | null;
  /** The metric the index DISPLAYS for this player: their strongest actual contribution (goals vs
   *  assists), falling back to the role headline when they have not contributed yet. */
  displayMetric: string | null;
  /** The shown actual for displayMetric (e.g. goals for a scorer). */
  displayActual: number;
  /** The expected that MATCHES displayMetric (expected_goals when showing goals). null = not
   *  projected; the cell then shows the actual with a dash expected (no fabrication). */
  displayExpected: number | null;
  /** Matches with logged stats so far. */
  matchesLogged: number;
  /** headlineActual − headlineExpected (positive = over-performing). null if no projection. */
  performanceDelta: number | null;
}

/** Everything a /players/[id] profile page needs: identity + all projection metrics + the per-match
 *  stats log + positional-percentile context for the profile bars. */
export interface PlayerProfile {
  player: PlayerIdentity;
  projections: PlayerProjection[];
  matchStats: PlayerMatchStat[];
  /** Per-metric positional percentile vs the field (0..100), keyed by baseline metric (role-dependent,
   *  e.g. xg/xa for FW, saves/clean_sheet_rate for GK). null for actuals-only players. */
  percentileContext: Record<string, number> | null;
  /** The model run the projections were computed against (for the provenance footer). null when the
   *  player has no projections (actuals-only). */
  sourceRunId: string | null;
  /** The goal projection split (FW/MF), or null when the player has no expected_goals metric. */
  goals: PlayerGoals | null;
  /** The open-play finishing factor (goals-vs-xG conversion skill), or null when not projected. */
  finishingFactor: number | null;
}

/** The goal projection split for a FW/MF profile: headline expected goals (with band), and the
 *  open-play / penalty / non-penalty-xG breakdown. null components when a split metric is absent. */
export interface PlayerGoals {
  /** Headline expected tournament goals (== open play x finishing + discounted penalty). */
  expected: number | null;
  /** Expected OPEN-PLAY goals (npxg/90 derived, x finishing factor). */
  openPlay: number | null;
  /** Expected PENALTY goals (discounted + capped). */
  penalty: number | null;
  /** Expected open-play xG (non-penalty xG); null for StatsBomb-only players. */
  npxg: number | null;
  /** ~1-sigma band on the headline expected goals. */
  bandLow: number | null;
  bandHigh: number | null;
}

/** The freshness data contract for the currently-displayed projection generation. */
export interface ProjectionMeta {
  /** The model run the displayed generation was computed against (source_run_id). null if unknown. */
  runId: string | null;
  /** "condN" parsed from the run_id (= current on the survival/run dimension), null for a base run. */
  condLabel: string | null;
  /** As-of timestamp (ISO 8601): parsed from the run_id, falling back to the generation computed_at. */
  asOfDate: string | null;
}

/** One row on an award-race leaderboard. The ranking `value` is the Phase 2 model's composite score
 *  for that board (persisted as the award_* projection metric); `headline` is the player's role
 *  headline projection (e.g. expected_goals) for context where the UI wants it. */
export interface AwardRaceEntry {
  playerId: string;
  name: string;
  nation: string;
  team: string | null;
  role: string | null;
  club: string | null;
  /** The board's ranking value (the model's composite score for this award). */
  expectedValue: number | null;
  bandLow: number | null;
  bandHigh: number | null;
  /** The player's role headline expected metric (name + value) for context, when available. */
  headlineMetric: string | null;
  headlineExpected: number | null;
  /** The player's accumulated ACTUAL count for this board so far (goals for goldenBoot, assists for
   *  playmaker), summed across logged matches. 0 when none. Optional/additive: only the actuals-first
   *  boards (goldenBoot, playmaker) populate it; the glove/potm/position boards leave it undefined. */
  actual?: number;
}

/** The four award leaderboards, ranked by the Phase 2 model's composite score per board (the award_*
 *  projection metrics), NOT re-derived from single metrics. */
/** A settled pick-vs-actual verdict for an ACTUALS award (Golden Boot, Playmaker). `pick` is the model's
 *  PRE-TOURNAMENT favourite - the highest expected value for the award metric across ALL tracked players
 *  (not just those who scored, so it is the model's real pick, never "the best scorer who happened to
 *  score"). `hit` is true when that favourite is also the actual winner (board rank 1). Null when either
 *  side is unavailable. Only shown once settled (there is a real winner to compare against). */
export interface AwardVerdict {
  pick: { playerId: string; name: string; nation: string; role: string | null };
  hit: boolean;
}

export interface AwardRaces {
  goldenBoot: AwardRaceEntry[];    // award_golden_boot
  playmaker: AwardRaceEntry[];     // award_playmaker
  goldenGlove: AwardRaceEntry[];   // award_golden_glove - INDIVIDUAL shot-stopping quality primary
  potm: AwardRaceEntry[];          // award_potm - the model's current pick (see potmCaveat)
  /** POTM is the noisiest board; carry the model's honest framing for the UI to show. */
  potmNoisy: boolean;
  potmCaveat: string;
  /** Settled pick-vs-actual verdicts for the two actuals boards (model favourite vs actual winner);
   *  null/undefined when not settled or the data is unavailable. Additive - existing readers ignore it. */
  goldenBootVerdict?: AwardVerdict | null;
  playmakerVerdict?: AwardVerdict | null;
}

/** The four "best at each position" boards (A7), each ranked by the model's role-appropriate overall
 *  rating (position_best_<role> metric): role headline expected value blended with the role's key
 *  positional percentiles. Reused entry shape; `expectedValue` is the position rating (0..100). */
export interface PositionLeaders {
  gk: AwardRaceEntry[];   // position_best_gk
  df: AwardRaceEntry[];   // position_best_df
  mf: AwardRaceEntry[];   // position_best_mf
  fw: AwardRaceEntry[];   // position_best_fw
}

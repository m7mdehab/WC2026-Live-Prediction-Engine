// Hand-written types mirroring the Supabase schema (db/schema.sql, db/schema_b.sql).

export type Stage =
  | "group" | "round_of_32" | "round_of_16" | "quarter_finals"
  | "semi_finals" | "third_place_playoff" | "final";

export interface Team {
  name: string;
  group_code: string;
  confederation: string;
  fifa_rank: number | null;
  host_flag: boolean;
  home_altitude_m: number;
}

export interface Fixture {
  match_id: string;
  match_no: number;
  stage: Stage;
  group_code: string | null;
  team_a_slot: string;
  team_b_slot: string;
  team_a: string | null;
  team_b: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  venue_altitude_m: number | null;
  kickoff_utc: string | null;
  status: "scheduled" | "completed";
}

export interface MatchResult {
  match_id: string;
  home_score: number;
  away_score: number;
  winner_team: string | null;
  status: string;
  entered_at: string;
  entered_by: string | null;
}

export interface ModelPredictionRun {
  run_id: string;
  created_at: string;
  model_version: string;
  simulator_version: string;
  code_version: string | null;
  git_commit: string | null;
  data_version: string | null;
  data_hash: string | null;
  rng_seed: number | null;
  training_cutoff_date: string | null;
  data_cutoff_time: string | null;
  calibration_method: string | null;
  run_type: string;
  iterations: number;
  conditioned_on_results: number;
}

export interface TeamProbabilities {
  run_id: string;
  team: string;
  advance_group: number | null;
  reach_r16: number | null;
  reach_qf: number | null;
  reach_sf: number | null;
  reach_final: number | null;
  champion: number | null;
}

export interface MatchProbabilities {
  run_id: string;
  match_id: string;
  p_team_a_win: number | null;
  p_draw: number | null;
  p_team_b_win: number | null;
  exp_goals_a: number | null;
  exp_goals_b: number | null;
}

export interface CurrentForecast {
  run: ModelPredictionRun;
  teamProbabilities: TeamProbabilities[];
  matchProbabilities: MatchProbabilities[];
}

// ---- match_factors (db/schema_c.sql, jsonb) - the honest factor decomposition from 4B.1.
// Every field is a real model input / data fact; the UI copy is generated from these only.
export interface FormMatch {
  date: string;
  opponent: string;
  venue: "home" | "away" | "neutral";
  score: string;
  result: "W" | "D" | "L";
  competition: string;
  opponent_rank: number | null;
  notable: boolean;
}
export interface RatingGap {
  elo_a: number | null;
  elo_b: number | null;
  diff: number | null; // elo_a - elo_b
  favored: string | null;
  band: "negligible" | "slight" | "moderate" | "large" | null;
}
export type HostEffect =
  | { applies: false }
  | {
      applies: true;
      team: string;
      coef_log_goals: number;
      h: number;
      h_wc_discount: number;
      note: string;
    };
export type Altitude =
  | { applies: false; venue_altitude_m: number }
  | {
      applies: true;
      venue_altitude_m: number;
      disadvantaged_team: string;
      burden_km: number;
      goal_rate_penalty_log: number;
      altitude_coef: number;
    };
export interface MatchFactors {
  team_a: string;
  team_b: string;
  rating_gap: RatingGap;
  host_effect: HostEffect;
  altitude: Altitude;
  fifa_rank: { team_a: number | null; team_b: number | null };
  recent_form: { team_a: FormMatch[]; team_b: FormMatch[] };
}

export interface MatchFactorsRow {
  run_id: string;
  match_id: string;
  factors: MatchFactors | null;
}

/** An upcoming fixture joined with its live probabilities and factor decomposition. */
export interface UpcomingMatch {
  match_id: string;
  match_no: number;
  team_a: string;
  team_b: string;
  city: string | null;
  country: string | null;
  kickoff_utc: string | null;
  probs: MatchProbabilities | null;
  factors: MatchFactors | null;
  /** Recorded final score, team_a/team_b orientation (match_results convention), if entered. */
  result?: { a: number; b: number } | null;
  /** True when a completed result is recorded (or the fixture is marked completed). */
  finished?: boolean;
}

/** The current champion pick + the real facts behind it (for the hero's "why" line). */
export interface ChampionContext {
  team: string;
  champion: number;
  reachFinal: number | null;
  fifaRank: number | null;
  elo: number | null;
  form: FormMatch[];
}

// ---- projected_bracket (db/schema_d.sql) - the 4C.1 projected knockout bracket. ----
export interface BracketMatchRow {
  run_id: string;
  match_id: string;
  match_no: number;
  stage: Stage;
  slot_a: string | null;
  slot_b: string | null;
  team_a: string | null;
  team_b: string | null;
  a_resolved: boolean;
  b_resolved: boolean;
  p_a: number | null;
  p_draw: number | null;
  p_b: number | null;
  exp_goals_a: number | null;
  exp_goals_b: number | null;
  occ_prob_a: number | null;
  occ_prob_b: number | null;
  proj_winner: string | null;
  champion_path: boolean;
}

/** A projected-bracket match joined with its fixture venue/date. */
export interface BracketMatch extends BracketMatchRow {
  venue: string | null;
  city: string | null;
  country: string | null;
  kickoff_utc: string | null;
}

export interface ProjectedBracket {
  run: ModelPredictionRun | null;
  champion: string | null;
  /** by match_id (M073…M104) */
  matches: Record<string, BracketMatch>;
}

// ---- match_extras (db/schema_e.sql) - scorelines + head-to-head for the match pages (4C.3). ----
export interface Scoreline {
  score: string;        // "2-1" (team_a-team_b)
  ga: number;
  gb: number;
  p: number;
  result: "a" | "b" | "draw";
}
export interface H2HMeeting {
  date: string;
  competition: string;
  a_score: number;
  b_score: number;
  neutral: boolean;
  winner: string | null; // team name, or null for a draw
}
export interface HeadToHead {
  played: number;
  a_wins: number;
  draws: number;
  b_wins: number;
  goals_a: number;
  goals_b: number;
  recent: H2HMeeting[]; // most-recent first, team_a's perspective
}
export interface MatchExtrasRow {
  run_id: string;
  match_id: string;
  scorelines: Scoreline[] | null;
  h2h: HeadToHead | null;
}

// ---- group_standings_projection (db/schema_f.sql) - projected group tables (4C.4). ----
export interface GroupStandingRow {
  run_id: string;
  group_code: string;
  team: string;
  p_first: number;
  p_second: number;
  p_third: number;
  p_fourth: number;
  p_best_third: number;
  proj_rank: number;
}
export type GroupStatus = "projected" | "live" | "final";

/** A team row derived for the group table UI (three-state: projected / live / final). */
export interface GroupTableTeam {
  team: string;
  hostFlag: boolean;
  fifaRank: number | null;
  elo: number | null;
  // projected odds (current run)
  pWinGroup: number;   // P(1st)
  pTop2: number;       // P(1st)+P(2nd)
  pBestThird: number;  // P(qualify as best-8 third)
  pQualify: number;    // pTop2 + pBestThird  (≈ team_probabilities.advance_group)
  // locked pre-tournament baseline (the cond0 run) - fixed reference for the pred chip + delta
  predRank: number;          // baseline projected finishing rank (1..4)
  baselineQualify: number;   // baseline P(qualify)
  // live / final - null until the recalc pipeline supplies real standings
  points: number | null;
  liveRank: number | null;
  qualifyDelta: number | null;  // pQualify − baselineQualify (signed), live only
  finalRank: number | null;
  qualified: boolean | null;
  predCorrect: boolean | null;  // final: did predRank land in the same qualify/out bucket
}
export interface GroupProjection {
  group_code: string;
  status: GroupStatus;
  played: number;            // matchdays played (0..3)
  teams: GroupTableTeam[];   // order depends on status (pred / points / final)
}

// ---- Wave 1 match-page additions. One line per player who scored or was booked, grouped by the
// team they belong to (own goals are surfaced under the team that BENEFITED, marked OG, in the UI). ----
export interface MatchPlayerLine {
  player_id: string;
  name: string;
  goals: number;       // regular goals FOR their own team
  own_goals: number;   // own goals (count for the OPPONENT scoreline)
  yellow: number;
  red: number;
}
export interface MatchContributions {
  team_a: MatchPlayerLine[];
  team_b: MatchPlayerLine[];
}

// One retained run's W/D/L for this fixture, ordered oldest->newest, for the per-match trend chart.
export interface WinProbPoint {
  run_id: string;
  created_at: string | null;
  p_team_a_win: number | null;
  p_draw: number | null;
  p_team_b_win: number | null;
}

// Display-only team match stats (match_team_stats; FotMob/ESPN, NEVER the model or quorum).
export interface MatchTeamStatLine {
  team: string;
  possession: number | null;
  shots: number | null;
  shots_on_target: number | null;
  corners: number | null;
  fouls: number | null;
  offsides: number | null;
  yellow: number | null;
  red: number | null;
  source: string | null;
}
export interface MatchTeamStatsPair {
  team_a: MatchTeamStatLine | null;
  team_b: MatchTeamStatLine | null;
}

/** Everything a /match/[id] page needs for one real fixture. */
export interface MatchDetail {
  run: ModelPredictionRun | null;
  fixture: Fixture;
  probs: MatchProbabilities | null;
  factors: MatchFactors | null;
  scorelines: Scoreline[] | null;
  h2h: HeadToHead | null;
  /** Recorded final score, team_a/team_b orientation (match_results convention), if entered. */
  result?: { a: number; b: number } | null;
  /** True when a completed result is recorded (or the fixture is marked completed). */
  finished?: boolean;
  // ---- Wave 1 additions (each optional; a reader fills it in, the renderer fail-soft-hides it) ----
  /** Goalscorers + bookings from player_match_stats (Wave 1.3). */
  contributions?: MatchContributions | null;
  /** W/D/L across retained runs, oldest->newest (Wave 1.4). */
  winProbTrend?: WinProbPoint[] | null;
  /** Team match stats: possession/shots/etc. (Wave 1.6; null until match_team_stats is populated). */
  teamStats?: MatchTeamStatsPair | null;
  /** Shootout: the advancing team + the pens tally + how the match ended (Wave 1.7). */
  winnerTeam?: string | null;
  pens?: { a: number; b: number } | null;
  endState?: string | null;
}

export interface GroupSnapshotTeam {
  team: string;
  advance_group: number | null;
  host_flag: boolean;
}
export interface GroupSnapshot {
  group_code: string;
  teams: GroupSnapshotTeam[];
}

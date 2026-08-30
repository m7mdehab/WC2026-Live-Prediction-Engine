// forecast types - owned by the forecast track. Domain types for the /forecast page.
// These describe what the page renders, derived from team_probabilities + teams + the current run.

import type { ModelPredictionRun } from "@/lib/types";
import type { StageLevel } from "@/lib/data/surpriseIndex";

/** One team's full forecast row: the raw model stage-odds plus the pedigree signals
 *  (FIFA rank + Elo) the page uses to derive dark-horse / overvalued calls. All probabilities
 *  are in [0,1]; nulls mean the model didn't publish that field for the team. */
export interface ForecastTeam {
  team: string;
  groupCode: string | null;
  hostFlag: boolean;
  fifaRank: number | null;
  elo: number | null;
  // model stage odds (from team_probabilities)
  champion: number | null;     // win the tournament
  reachFinal: number | null;   // finalist
  reachSf: number | null;      // reach the semi-finals
  reachQf: number | null;      // reach the quarter-finals (our "deep run" threshold)
  advanceGroup: number | null; // survive the group
  // derived percentiles across the 48-team field, each in [0,1] (1 = best)
  eloPct: number | null;       // by Elo (higher Elo → higher)
  fifaPct: number | null;      // by FIFA rank (lower rank number → higher)
  pedigreePct: number | null;  // blended Elo+FIFA pedigree
  deepRunPct: number;          // by reach_qf (the deep-run odds percentile)
}

/** A team flagged as a dark horse: its ACHIEVED outcome ran furthest ahead of the frozen
 *  pre-tournament baseline (the sticky surprise index). Sticky: an eliminated over-performer stays.
 *  Sourced from lib/data/surpriseIndex (results-driven, never from a live probability). */
export interface DarkHorse {
  team: string;
  fifaRank: number | null;
  hostFlag: boolean;
  /** deepest stage the team ACTUALLY reached (from results). */
  deepestStage: StageLevel;
  deepestStageLabel: string;
  /** weighted, normalized surprise index in [0,1] (higher: further ahead of its baseline). */
  surpriseIndex: number;
  stageSurprise: number;
  matchSurprise: number;
}

/** A team flagged as overvalued: a strong FIFA pedigree its ACHIEVED outcome did not back. The exact
 *  mirror of the dark-horse read (FIFA-rank percentile minus achieved-outcome percentile). */
export interface Overvalued {
  team: string;
  fifaRank: number | null;
  hostFlag: boolean;
  deepestStage: StageLevel;
  deepestStageLabel: string;
  /** fifaPct − achievedPct (positive: pedigree sits above what the team actually achieved). */
  gap: number;
  fifaPct: number;
  achievedPct: number;
}

/** Everything the /forecast page renders, for the current run. */
export interface ForecastData {
  run: ModelPredictionRun | null;
  /** All 48 teams, sorted by champion% desc. */
  teams: ForecastTeam[];
  darkHorses: DarkHorse[];
  overvalued: Overvalued[];
  /** true when the rows are a dev fixture (FORECAST_DEMO), not live Supabase data. */
  demo: boolean;
}

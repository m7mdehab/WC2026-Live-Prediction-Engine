// methodology types - owned by the methodology track. Add domain types here (keep out of the shared lib/types.ts).

/** The three outcome classes the W/D/L backtest scores (and the reliability diagram splits on). */
export type OutcomeClass = "home_win" | "draw" | "away_win";

/** One 10-bin reliability point, straight from data/backtest/reliability_20{18,22}.csv.
 *  `meanPred`/`obsFreq` are null for empty bins (no predictions landed there). */
export type ReliabilityPoint = {
  year: 2018 | 2022;
  klass: OutcomeClass;
  binLow: number;
  binHigh: number;
  n: number;
  meanPred: number | null;
  obsFreq: number | null;
};

/** One backtest year: the full Dixon–Coles model vs the Elo-logistic baseline. */
export type BacktestRow = {
  year: 2018 | 2022;
  held: "tuned" | "held-out";
  dcBrier: number;
  dcLogLoss: number;
  baseBrier: number;
  baseLogLoss: number;
  deltaBrier: number;
  deltaSigma: number;
  withinOneSigma: boolean;
};

/** One step of the 2022 coordinate-descent tuning trajectory. */
export type TuningStep = {
  knob: string;
  loss: number;
  brier: number;
  logLoss: number;
};

/** A calibration map that was evaluated and its verdict. */
export type CalibrationEval = {
  method: "platt" | "isotonic";
  brier2018Pct: number;
  brier2022Pct: number;
  logLossNote: string;
  verdict: string;
};

/** The 10-field reproducibility block recorded with every prediction run
 *  (db/schema.sql public.model_prediction_runs). `value` null ⇒ assigned at publish. */
export type ReproField = {
  field: string;
  value: string | null;
  note: string;
};

/** A champion-probability leaderboard entry (post-tuning, 10k Monte Carlo). */
export type ChampionShare = { team: string; champion: number };

/** WC2022 in-tournament walk-forward retrodiction summary
 *  (docs/phase_2_5_retrodiction_report.md, data/backtest/wc2022_retro_metrics.json).
 *  `staticBrier`/`staticLogLoss` are the static pre-tournament fit for comparison. */
export type Retrodiction = {
  n: number;
  brier: number;
  logLoss: number;
  mae: number;
  top1: number;
  top2: number;
  spearman: number;
  staticBrier: number;
  staticLogLoss: number;
};

/** One year's pre-tournament champion-odds reading (data/backtest/wc20XX_champion_odds.json):
 *  where the eventual champion ranked, and the single favourite that year. */
export type PreChampionOdds = {
  year: 2018 | 2022;
  champion: string;
  championRank: number;
  championPct: number;
  favourite: string;
  favouritePct: number;
};

/** One walk-forward stage for the eventual champion (data/backtest/wc20XX_champion_convergence.json).
 *  `rank` is among the teams still alive after that stage's ACTUAL results; `pct` is its champion-odds
 *  in the re-simulated remaining bracket; `topTeam`/`topPct` is the model's top remaining pick. */
export type ConvergenceStage = {
  stage: string;
  remaining: number;
  rank: number;
  pct: number;
  topTeam: string;
  topPct: number;
};

/** One year's full walk-forward convergence trajectory for the eventual champion. */
export type ConvergenceYear = {
  year: 2018 | 2022;
  champion: string;
  stages: ConvergenceStage[];
  becameNumberOneAt: string | null;
  monotone: boolean;
};

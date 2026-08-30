// methodology data layer - owned by the methodology track.
//
// This page is static and content-driven, so the figures below are transcribed verbatim from the
// committed model artifacts (no Supabase read). Each block cites its source file; if the model is
// re-fit, regenerate these from the same artifacts. Sources:
//   • data/backtest/reliability_2018.csv, reliability_2022.csv  (reliability points; mirrored to
//     web/public/methodology/ for download)
//   • docs/phase_2_4_backtest_report.md                          (backtest, tuning, calibration)
//   • model/calibration_v0.json                                 (calibration decision + evidence)
//   • model/dixon_coles_params.json                             (final DC scalars)
//   • model/elo.py, model/dixon_coles.py                        (model hyperparameters)
//   • data/backtest/final_results.json, convergence.json        (champion shares, MC convergence)
//   • data/data_manifest.json + db/schema.sql                   (reproducibility block)
//
// The reproducibility + calibration figures, by contrast, are read LIVE from the published
// forecast run (the `current_run` view on model_prediction_runs) - the same source the home /
// forecast pages use - so they stay accurate and refresh at the June-10 final re-run. This module
// is therefore server-only; the reliability constants are handed to the client chart as props.
import "server-only";
import { publicClient } from "@/lib/supabase/public";
import { cachedRead, TAGS } from "@/lib/data/cache";
import type { ModelPredictionRun } from "@/lib/types";
import type {
  BacktestRow,
  CalibrationEval,
  ChampionShare,
  ConvergenceYear,
  OutcomeClass,
  PreChampionOdds,
  ReliabilityPoint,
  ReproField,
  Retrodiction,
  TuningStep,
} from "@/lib/types/methodology";

/** The forecast run the public currently sees (current_run view). Null if the read fails or no
 *  run is published yet - callers fall back to the committed-artifact values. */
export function getReproRun(): Promise<ModelPredictionRun | null> {
  return cachedRead("repro-run", [TAGS.methodology, TAGS.run], _getReproRunUncached);
}

async function _getReproRunUncached(): Promise<ModelPredictionRun | null> {
  try {
    const sb = publicClient();
    const { data, error } = await sb.from("current_run").select("*").limit(1);
    if (error) throw error;
    return (data?.[0] as ModelPredictionRun | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Render the published run's 10-field reproducibility block. Field notes mirror db/schema.sql. */
export function reproRowsFromRun(run: ModelPredictionRun): ReproField[] {
  const code = run.code_version ?? run.git_commit;
  const hash = run.data_hash ? `${run.data_hash.slice(0, 16)}… (SHA-256)` : null;
  return [
    { field: "model_version", value: run.model_version || null, note: "Identifies the committed Elo + Dixon–Coles fit." },
    { field: "simulator_version", value: run.simulator_version || null, note: "Identifies the Monte Carlo engine + tie-breaker logic." },
    { field: "code_version / git_commit", value: code ? code.slice(0, 12) : null, note: "Repository commit the run was produced from." },
    { field: "data_version", value: run.data_version, note: "Snapshot date of the cleaned results dataset." },
    { field: "data_hash", value: hash, note: "Hash of the source results CSV (martj42/international_results)." },
    { field: "rng_seed", value: run.rng_seed != null ? String(run.rng_seed) : null, note: "Monte Carlo seed: fixed, so a re-run reproduces the same draws." },
    { field: "training_cutoff_date", value: run.training_cutoff_date, note: "Matches on or before this date were used to fit; nothing after leaks in." },
    { field: "data_cutoff_time", value: run.data_cutoff_time, note: "Null pre-tournament; set to the as-of time once live results condition the run." },
    { field: "calibration_method", value: run.calibration_method, note: "Calibration assessed and applied (see calibration section)." },
    { field: "run_type", value: run.run_type || null, note: "Distinguishes a forecast run from a data build or backtest." },
  ];
}

/** Final Dixon–Coles scalars (model/dixon_coles_params.json), chosen config. */
export const DC_PARAMS = {
  interceptC: 0.31,
  homeAdvantage: 0.29,
  altitudeCoef: 0.168,
  rho: -0.03,
  halfLifeDays: 1460,
  lambdaPrior: 20,
  fitMinDate: "2008-01-01",
  trainingCutoff: "2026-06-03",
} as const;

/** Elo hyperparameters (model/elo.py, chosen tier weights). */
export const ELO_PARAMS = {
  baseK: 32,
  homeAdvElo: 65,
  altitudeCoef: 50,
  gdMultiplier: "1 + ln(1 + |GD|)",
  initial: 1500,
  tierWeights: { 1: 1.1, 2: 0.75, 3: 0.6, 4: 0.45, 5: 0.3 } as Record<number, number>,
} as const;

/** Top of the Elo table after the final refit (data/backtest/final_results.json). */
export const ELO_TOP10 = [
  "Spain", "Argentina", "France", "Brazil", "England",
  "Netherlands", "Portugal", "Colombia", "Germany", "Croatia",
] as const;

/** Backtest - full Dixon–Coles vs the Elo-logistic baseline, chosen (tuned/held-out) config.
 *  docs/phase_2_4_backtest_report.md §5. Revised gate: DC within 1σ of the baseline on Brier. */
export const BACKTEST: BacktestRow[] = [
  {
    year: 2018, held: "held-out",
    dcBrier: 0.5976, dcLogLoss: 0.9985,
    baseBrier: 0.5856, baseLogLoss: 0.9874,
    deltaBrier: 0.012, deltaSigma: 0.48, withinOneSigma: true,
  },
  {
    year: 2022, held: "tuned",
    dcBrier: 0.6123, dcLogLoss: 1.0286,
    baseBrier: 0.6018, baseLogLoss: 1.037,
    deltaBrier: 0.0105, deltaSigma: 0.35, withinOneSigma: true,
  },
];

/** A reference point: a uniform (1/3, 1/3, 1/3) model. Both years beat it comfortably. */
export const UNIFORM_BASELINE = { brier: 0.667, logLoss: 1.099 } as const;

/** WC2022 in-tournament walk-forward retrodiction (docs/phase_2_5_retrodiction_report.md,
 *  data/backtest/wc2022_retro_metrics.json). Refit before every match on data strictly before
 *  it, including earlier WC2022 results. Honest finding: in-tournament updating does NOT beat
 *  the static pre-tournament fit on Brier/log loss/MAE; the static numbers are shown alongside. */
export const RETRODICTION: Retrodiction = {
  n: 64,
  brier: 0.6205, logLoss: 1.0422, mae: 0.4175,
  top1: 0.5469, top2: 0.75, spearman: 0.521,
  staticBrier: 0.6123, staticLogLoss: 1.0286,
};

// ── Validation: champion-odds backtest ──────────────────────────────────────────────────────────
// Block (a) pre-tournament champion odds: transcribed from data/backtest/wc20XX_champion_odds.json
// (eventual_winner.champion_rank / champion_pct; top10_champion_odds[0] = the single favourite).
/** Pre-tournament champion odds, both backtest years (data/backtest/wc20XX_champion_odds.json). */
export const PRE_CHAMPION_ODDS: PreChampionOdds[] = [
  { year: 2022, champion: "Argentina", championRank: 2, championPct: 10.24, favourite: "Brazil", favouritePct: 15.88 },
  { year: 2018, champion: "France", championRank: 5, championPct: 5.83, favourite: "Brazil", favouritePct: 14.35 },
];

// Block (b) walk-forward convergence: transcribed VERBATIM from
// data/backtest/wc20XX_champion_convergence.json (stages[].label, stages[].champion.
// rank_among_remaining / champion_pct, stages[].remaining_top[0], became_number_one_at,
// rank_trajectory_monotone). Stages are labelled by their remaining field (16 -> Round of 16,
// 8 -> Quarter-finals, 4 -> Semi-finals, 2 -> Final), NOT "pre-tournament" (this is the post-group
// knockout field, not the 32-team pre-tournament block above). Both eventual champions became the
// model's #1 remaining pick once only four remained (the Semi-finals field, after the quarter-finals),
// not before, and both trajectories are monotone (the field shrinks each round, so part of the rise is
// mechanical via elimination).
/** Walk-forward champion-odds convergence, both backtest years (50k iters, seed 42). */
export const CONVERGENCE: ConvergenceYear[] = [
  {
    year: 2022, champion: "Argentina", becameNumberOneAt: "Semi-finals", monotone: true,
    stages: [
      { stage: "Round of 16", remaining: 16, rank: 2, pct: 12.94, topTeam: "Brazil", topPct: 19.34 },
      { stage: "Quarter-finals", remaining: 8, rank: 2, pct: 16.31, topTeam: "Brazil", topPct: 25.32 },
      { stage: "Semi-finals", remaining: 4, rank: 1, pct: 37.16, topTeam: "Argentina", topPct: 37.16 },
      { stage: "Final", remaining: 2, rank: 1, pct: 53.44, topTeam: "Argentina", topPct: 53.44 },
    ],
  },
  {
    year: 2018, champion: "France", becameNumberOneAt: "Semi-finals", monotone: true,
    stages: [
      { stage: "Round of 16", remaining: 16, rank: 5, pct: 6.64, topTeam: "Brazil", topPct: 16.98 },
      { stage: "Quarter-finals", remaining: 8, rank: 3, pct: 14.69, topTeam: "Brazil", topPct: 26.61 },
      { stage: "Semi-finals", remaining: 4, rank: 1, pct: 29.13, topTeam: "France", topPct: 29.13 },
      { stage: "Final", remaining: 2, rank: 1, pct: 57.3, topTeam: "France", topPct: 57.3 },
    ],
  },
];

// Block (c) match-model backtest read: from data/backtest/wc2022_retro_metrics.json (top-1 0.546875,
// top-2 0.75, Brier 0.6205 vs uniform 0.6667, Spearman 0.521) plus the named misses from the
// champion-odds artifacts (Brazil the top pick both years; Croatia, the 2018 finalist, ranked #11 -
// backed by data/backtest/wc2018_champion_odds.json full_ranking[10] and finalists[1].champion_rank,
// asserted in tests/test_champion_odds.py).
/** The honest match-model backtest read: a real but modest edge, with its misses named. */
export const MATCH_MODEL_READ = {
  top1Pct: 55, top2Pct: 75,
  brier: 0.62, uniformBrier: 0.67,
  spearman: 0.52,
  misses: {
    favouriteBothYears: "Brazil",
    finalistMissed: "Croatia",
    finalistYear: 2018,
    finalistRank: 11,
  },
} as const;

/** 2022 coordinate-descent tuning trajectory (docs/phase_2_4_backtest_report.md §4).
 *  Loss = 0.5·(Brier/Brier₀) + 0.5·(LogLoss/LogLoss₀), normalised to the default config. */
export const TUNING: TuningStep[] = [
  { knob: "default (730 / 5 / default tiers)", loss: 1.0, brier: 0.625, logLoss: 1.0453 },
  { knob: "half-life → 1460 d", loss: 0.9946, brier: 0.6212, logLoss: 1.0405 },
  { knob: "λ prior → 20", loss: 0.9905, brier: 0.6186, logLoss: 1.036 },
  { knob: "tier 1 → 1.10", loss: 0.9898, brier: 0.6182, logLoss: 1.0355 },
  { knob: "tier 2 → 0.75", loss: 0.9891, brier: 0.6177, logLoss: 1.0348 },
  { knob: "tier 3 → 0.60", loss: 0.9874, brier: 0.6165, logLoss: 1.0333 },
  { knob: "tier 4 → 0.45", loss: 0.9856, brier: 0.6151, logLoss: 1.0317 },
  { knob: "tier 5 → 0.30", loss: 0.9819, brier: 0.6123, logLoss: 1.0286 },
];

/** Calibration maps evaluated and rejected (model/calibration_v0.json + §6). Decision: none. */
export const CALIBRATION: CalibrationEval[] = [
  {
    method: "platt",
    brier2018Pct: 0.5, brier2022Pct: -0.3,
    logLossNote: "worse both years",
    verdict: "net-neutral on Brier, no calibration gain",
  },
  {
    method: "isotonic",
    brier2018Pct: 0.3, brier2022Pct: 2.3,
    logLossNote: "much worse 2022",
    verdict: "rejected: >1% Brier regression (small-window overfit)",
  },
];

/** Final champion shares, post-tuning, 10k Monte Carlo (data/backtest/final_results.json). */
export const CHAMPION_TOP12: ChampionShare[] = [
  { team: "Spain", champion: 0.1044 },
  { team: "Argentina", champion: 0.095 },
  { team: "Brazil", champion: 0.0731 },
  { team: "France", champion: 0.0711 },
  { team: "England", champion: 0.0534 },
  { team: "Portugal", champion: 0.0446 },
  { team: "Germany", champion: 0.0423 },
  { team: "Netherlands", champion: 0.0422 },
  { team: "Mexico", champion: 0.0383 },
  { team: "Colombia", champion: 0.037 },
  { team: "Belgium", champion: 0.0322 },
  { team: "Japan", champion: 0.0321 },
];

/** Monte Carlo convergence check (data/backtest/convergence.json) - the iters array there is
 *  [10000, 50000] and max_delta_pp 0.634 is the 10k↔50k champion-share drift. Note: that file's
 *  prose remedy still says "≥30k", which is stale - the published forecast runs at 50,000 sims
 *  (db/publish_forecast.py ITERS=50000; the home hero + group/bracket writers all use 50k, and
 *  scope_lock §7.6 frames the check as 10k↔50k). `publishedIters` is the fallback for the live
 *  run.iterations read. */
export const MONTE_CARLO = {
  seed: 42,
  acceptanceIters: 10000,
  publishedIters: 50000,
  convergenceTargetPp: 0.5,
  maxDeltaPp: 0.634,
  maxDeltaTeam: "Spain",
} as const;

/** Fallback reproducibility block - used only when the live `current_run` read is unavailable
 *  (no published run / Supabase unreachable). Values from data/data_manifest.json + the §7
 *  final-refit decision; model_version / simulator_version / data_cutoff_time stamped at publish. */
export const REPRO_FALLBACK: ReproField[] = [
  { field: "model_version", value: null, note: "Stamped at publish: identifies the committed Elo + Dixon–Coles fit." },
  { field: "simulator_version", value: null, note: "Stamped at publish: identifies the Monte Carlo engine + tie-breaker logic." },
  { field: "code_version / git_commit", value: "247e3433", note: "Repository commit the run was produced from." },
  { field: "data_version", value: "2026-06-03", note: "Snapshot date of the cleaned results dataset." },
  { field: "data_hash", value: "37e5ce3b… (SHA-256)", note: "Hash of the source results CSV (martj42/international_results)." },
  { field: "rng_seed", value: "42", note: "Monte Carlo seed: fixed, so a re-run reproduces the same draws." },
  { field: "training_cutoff_date", value: "2026-06-03", note: "Matches on or before this date were used to fit; nothing after leaks in." },
  { field: "data_cutoff_time", value: null, note: "Null pre-tournament; set to the as-of time once live results condition the run." },
  { field: "calibration_method", value: "none", note: "Raw model accepted as calibrated (Platt/isotonic gave no gain)." },
  { field: "run_type", value: "model_forecast", note: "Distinguishes a forecast run from a data build or backtest." },
];

/** The data source the whole pipeline is built on (data/data_manifest.json). */
export const DATA_SOURCE = {
  name: "martj42 / international_results",
  url: "https://github.com/martj42/international_results",
  cleanRows: 49291,
  rawRows: 49363,
  latestMatch: "2026-06-01",
  sha256: "37e5ce3b82849279da3e7c17284aa4e65a662848cbb699effe39a815ab57ef50",
  byTier: { 1: 964, 2: 3391, 3: 8771, 4: 8231, 5: 27934 } as Record<number, number>,
} as const;

// ── Reliability points - transcribed verbatim from data/backtest/reliability_20{18,22}.csv ──
// Empty bins (n = 0, no predictions) are dropped here; the chart only plots populated bins.
export const RELIABILITY: ReliabilityPoint[] = [
  // 2018 - home_win
  { year: 2018, klass: "home_win", binLow: 0.1, binHigh: 0.2, n: 4, meanPred: 0.1541, obsFreq: 0.25 },
  { year: 2018, klass: "home_win", binLow: 0.2, binHigh: 0.3, n: 20, meanPred: 0.2732, obsFreq: 0.15 },
  { year: 2018, klass: "home_win", binLow: 0.3, binHigh: 0.4, n: 21, meanPred: 0.3579, obsFreq: 0.381 },
  { year: 2018, klass: "home_win", binLow: 0.4, binHigh: 0.5, n: 8, meanPred: 0.449, obsFreq: 0.875 },
  { year: 2018, klass: "home_win", binLow: 0.5, binHigh: 0.6, n: 11, meanPred: 0.5544, obsFreq: 0.5455 },
  // 2018 - draw
  { year: 2018, klass: "draw", binLow: 0.2, binHigh: 0.3, n: 33, meanPred: 0.268, obsFreq: 0.1818 },
  { year: 2018, klass: "draw", binLow: 0.3, binHigh: 0.4, n: 31, meanPred: 0.3222, obsFreq: 0.2258 },
  // 2018 - away_win
  { year: 2018, klass: "away_win", binLow: 0.1, binHigh: 0.2, n: 9, meanPred: 0.1817, obsFreq: 0.0 },
  { year: 2018, klass: "away_win", binLow: 0.2, binHigh: 0.3, n: 11, meanPred: 0.2493, obsFreq: 0.3636 },
  { year: 2018, klass: "away_win", binLow: 0.3, binHigh: 0.4, n: 26, meanPred: 0.3463, obsFreq: 0.3846 },
  { year: 2018, klass: "away_win", binLow: 0.4, binHigh: 0.5, n: 14, meanPred: 0.4324, obsFreq: 0.7143 },
  { year: 2018, klass: "away_win", binLow: 0.5, binHigh: 0.6, n: 1, meanPred: 0.5642, obsFreq: 1.0 },
  { year: 2018, klass: "away_win", binLow: 0.6, binHigh: 0.7, n: 3, meanPred: 0.6266, obsFreq: 0.3333 },
  // 2022 - home_win
  { year: 2022, klass: "home_win", binLow: 0.0, binHigh: 0.1, n: 1, meanPred: 0.1, obsFreq: 1.0 },
  { year: 2022, klass: "home_win", binLow: 0.1, binHigh: 0.2, n: 4, meanPred: 0.1772, obsFreq: 0.0 },
  { year: 2022, klass: "home_win", binLow: 0.2, binHigh: 0.3, n: 16, meanPred: 0.2584, obsFreq: 0.3125 },
  { year: 2022, klass: "home_win", binLow: 0.3, binHigh: 0.4, n: 13, meanPred: 0.3594, obsFreq: 0.4615 },
  { year: 2022, klass: "home_win", binLow: 0.4, binHigh: 0.5, n: 20, meanPred: 0.4502, obsFreq: 0.45 },
  { year: 2022, klass: "home_win", binLow: 0.5, binHigh: 0.6, n: 9, meanPred: 0.549, obsFreq: 0.6667 },
  { year: 2022, klass: "home_win", binLow: 0.6, binHigh: 0.7, n: 1, meanPred: 0.6439, obsFreq: 1.0 },
  // 2022 - draw
  { year: 2022, klass: "draw", binLow: 0.2, binHigh: 0.3, n: 47, meanPred: 0.268, obsFreq: 0.234 },
  { year: 2022, klass: "draw", binLow: 0.3, binHigh: 0.4, n: 17, meanPred: 0.3125, obsFreq: 0.2353 },
  // 2022 - away_win
  { year: 2022, klass: "away_win", binLow: 0.1, binHigh: 0.2, n: 6, meanPred: 0.1589, obsFreq: 0.1667 },
  { year: 2022, klass: "away_win", binLow: 0.2, binHigh: 0.3, n: 19, meanPred: 0.2413, obsFreq: 0.2105 },
  { year: 2022, klass: "away_win", binLow: 0.3, binHigh: 0.4, n: 18, meanPred: 0.3379, obsFreq: 0.3889 },
  { year: 2022, klass: "away_win", binLow: 0.4, binHigh: 0.5, n: 12, meanPred: 0.4456, obsFreq: 0.4167 },
  { year: 2022, klass: "away_win", binLow: 0.5, binHigh: 0.6, n: 7, meanPred: 0.5208, obsFreq: 0.5714 },
  { year: 2022, klass: "away_win", binLow: 0.6, binHigh: 0.7, n: 2, meanPred: 0.6388, obsFreq: 0.0 },
];

// ── WC 2026 full-tournament calibration (Phase 3a/3b) ─────────────────────────────────────────────
// Transcribed VERBATIM from data/backtest/wc2026_calibration.json (computed by
// scripts/calibration_backtest.py from the stored run snapshots; full coverage, zero omitted). Two
// reads: (A) the FROZEN pre-tournament run (cond0) over the 72 GROUP matches, and (B) the LIVE
// walk-forward over the 32 KNOCKOUT matches. HONEST FINDING, stated on the page not hidden: the group
// cond0 (A) and the group live walk-forward (B) numbers are IDENTICAL, because a group-match
// prediction never depends on another group's results, so live conditioning did not move them. The
// model beats both baselines on Brier (positive skill) but is only modestly better than uniform on the
// group matches; it is sharper on the knockouts (top-1 78%). The group max calibration error (0.709)
// is driven almost entirely by a single-match bin: predicted ~0.71, one game, observed 0. Baselines:
// uniform (1/3, 1/3, 1/3) and base-rate/climatology (the observed group marginals, home/draw/away).
export const TOURNAMENT_CALIBRATION_2026 = {
  coverage: { groupTotal: 72, groupCovered: 72, koTotal: 32, koCovered: 32, omitted: 0 },
  uniformBrier: 0.667,
  baseRateBrier: 0.637,
  baseRateMarginals: { home: 0.472, draw: 0.278, away: 0.25 },
  // (A) frozen pre-tournament cond0 over the 72 group matches (== the group live walk-forward, B).
  group: {
    label: "Group stage",
    context: "frozen pre-tournament, unchanged by live conditioning",
    n: 72,
    brier: 0.546,
    logLoss: 0.92,
    top1Pct: 58.3,
    top2Pct: 87.5,
    maxCalErr: 0.709,
    skillVsUniformPct: 18.1,
    skillVsBaseRatePct: 14.4,
  },
  // (B) live walk-forward over the 32 knockout matches.
  knockout: {
    label: "Knockout",
    context: "live walk-forward, re-conditioned each round",
    n: 32,
    brier: 0.489,
    logLoss: 0.848,
    top1Pct: 78.1,
    top2Pct: 87.5,
    maxCalErr: 0.486,
    skillVsUniformPct: 26.7,
    skillVsBaseRatePct: 17.7,
  },
} as const;

// ── WC 2026 reliability points - transcribed VERBATIM from web/public/methodology/reliability_2026.csv
// (the B_live_walkforward_all curve: every one of the 104 covered matches, group + knockout). Shaped
// exactly like the RELIABILITY constant above minus the `year` field (this curve is 2026-only); empty
// bins (n = 0, no predictions) are dropped, matching RELIABILITY. The single home_win bin at
// mean_pred 0.7087 -> observed 0 (n = 1) is the outlier behind the 0.709 group max calibration error,
// kept visible rather than smoothed away.
export type Reliability2026Point = {
  klass: OutcomeClass;
  binLow: number;
  binHigh: number;
  n: number;
  meanPred: number;
  obsFreq: number;
};

export const RELIABILITY_2026: Reliability2026Point[] = [
  // home_win
  { klass: "home_win", binLow: 0.1, binHigh: 0.2, n: 8, meanPred: 0.1688, obsFreq: 0.0 },
  { klass: "home_win", binLow: 0.2, binHigh: 0.3, n: 23, meanPred: 0.2556, obsFreq: 0.2174 },
  { klass: "home_win", binLow: 0.3, binHigh: 0.4, n: 20, meanPred: 0.3462, obsFreq: 0.35 },
  { klass: "home_win", binLow: 0.4, binHigh: 0.5, n: 20, meanPred: 0.4322, obsFreq: 0.65 },
  { klass: "home_win", binLow: 0.5, binHigh: 0.6, n: 22, meanPred: 0.5488, obsFreq: 0.7727 },
  { klass: "home_win", binLow: 0.6, binHigh: 0.7, n: 10, meanPred: 0.6434, obsFreq: 0.8 },
  { klass: "home_win", binLow: 0.7, binHigh: 0.8, n: 1, meanPred: 0.7087, obsFreq: 0.0 },
  // draw
  { klass: "draw", binLow: 0.1, binHigh: 0.2, n: 3, meanPred: 0.1905, obsFreq: 0.3333 },
  { klass: "draw", binLow: 0.2, binHigh: 0.3, n: 81, meanPred: 0.264, obsFreq: 0.1975 },
  { klass: "draw", binLow: 0.3, binHigh: 0.4, n: 20, meanPred: 0.3176, obsFreq: 0.35 },
  // away_win
  { klass: "away_win", binLow: 0.0, binHigh: 0.1, n: 2, meanPred: 0.0954, obsFreq: 0.0 },
  { klass: "away_win", binLow: 0.1, binHigh: 0.2, n: 23, meanPred: 0.1607, obsFreq: 0.0 },
  { klass: "away_win", binLow: 0.2, binHigh: 0.3, n: 24, meanPred: 0.2536, obsFreq: 0.0833 },
  { klass: "away_win", binLow: 0.3, binHigh: 0.4, n: 22, meanPred: 0.3503, obsFreq: 0.1818 },
  { klass: "away_win", binLow: 0.4, binHigh: 0.5, n: 21, meanPred: 0.4444, obsFreq: 0.619 },
  { klass: "away_win", binLow: 0.5, binHigh: 0.6, n: 10, meanPred: 0.5386, obsFreq: 0.9 },
  { klass: "away_win", binLow: 0.6, binHigh: 0.7, n: 2, meanPred: 0.6403, obsFreq: 1.0 },
];

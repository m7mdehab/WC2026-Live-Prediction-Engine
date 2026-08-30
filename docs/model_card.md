# Model card: the World Cup 2026 forecasting engine

Written 2026-08-30. Every figure carries the file it can be checked against.

## What it is

A probabilistic forecast of match outcomes and tournament progression. It is not a tipster and it does
not produce a single predicted scoreline as an answer. Its output is a distribution, and the only
honest way to judge it is a scoring rule over many matches, which is why the Brier score and log loss
appear before anything else on the methodology page.

## Architecture

Two components, blended.

**A Dixon-Coles bivariate-Poisson goal model** (`model/dixon_coles.py`) fitted to historical
international results. It models home and away goal rates with a low-score dependence correction, so
0-0, 1-0, 0-1 and 1-1 are not treated as independent draws of two Poissons. The scoreline structure is
the reason this model is used rather than a win/draw/loss classifier: the simulator needs exact
scores, extra time, penalties and goal-difference tie-breaks, and a classifier cannot produce them.

**An Elo rating system** (`model/elo.py`) providing a strength prior, with a competition-tier weighting
so a World Cup qualifier and a friendly do not move a rating equally.

**A host advantage term** for the tournament hosts, and an altitude factor
(`data/team_home_altitude.csv`).

**A Monte Carlo tournament simulation** (`simulator/engine.py`) that plays the bracket 50,000 times at
a fixed seed, applying the FIFA Article 13 group tie-break chain in full
(`simulator/tiebreakers.py`) and the third-place qualification matrix
(`data/third_place_matrix_2026.json`).

Versions are recorded on every run as `model_version: elo-dc-v1.0` and
`simulator_version: shell-v0.1`.

## Training data

Cleaned international results in `data/historical_results_clean.csv`, with provenance in
`data/data_manifest.json`. The published run's `training_cutoff_date` is 2026-06-10: matches on or
before that date were used to fit, and nothing after it leaks in. That is not a convention, it is
enforced: `model/backtest.py::assert_pre_cutoff` raises rather than returning a number if any training
row falls on or after the cutoff, and `tests/test_backtest.py:15` proves the guard fires.

Tuning was done on 2022. 2018 was held out and never used to select a hyperparameter. The tuning
trajectory is eight coordinate-descent steps recorded in `data/backtest/tuning_2022.json`; the data
preferred a longer half-life (730 to 1460 days) and a stronger Elo prior.

## Evaluation

**Held out and tuned backtests**, refit strictly before each opener:

| tournament | Brier | log loss | baseline Brier | delta | verdict |
|---|---|---|---|---|---|
| 2018 (held out) | 0.5976 | 0.9985 | 0.5856 | +0.0120 (0.48 sigma) | within 1 sigma |
| 2022 (tuned) | 0.6123 | 1.0286 | 0.6018 | +0.0105 (0.35 sigma) | within 1 sigma |

A uniform (1/3, 1/3, 1/3) model scores 0.667 Brier and 1.099 log loss. The comparison baseline is a
calibrated logistic on the same Elo signal, which is a strong win/draw/loss baseline; the gate is set
to detect brokenness rather than to pick a winner for the same job, because the baseline cannot
produce scorelines.

**The 2026 tournament itself**, from `data/backtest/wc2026_calibration.json`:

| | group | knockout |
|---|---|---|
| n | 72 | 32 |
| Brier | 0.5457 | 0.4886 |
| log loss | 0.9201 | 0.8480 |
| top-1 | 58.3% | 78.1% |

Coverage is 72 of 72 group matches and 32 of 32 knockouts, and the `omitted` list in that file is
empty.

**Calibration was assessed, not assumed.** Platt scaling and isotonic regression were both fitted and
both rejected: Platt is net-neutral on Brier and degrades log loss, isotonic regresses Brier by 2.3%
on 2022, which is small-window overfitting. The published run therefore records
`calibration_method: none`, a checked result rather than an omission.

**In-tournament updating did not help.** Replaying 2022 match by match, refitting before each of the
64 games, scored worse than the static pre-tournament fit (Brier 0.6205 against 0.6123). The finding
is published rather than buried; see `data/backtest/wc2022_retro_metrics.json`. With a four-year
half-life and a strong long-run prior, sixty noisy tournament matches barely move the fit, which is by
design.

## Known limitations

**No team news.** Injuries, suspensions, lineups and form within a camp are invisible to it. It sees
match results, not who is on the pitch.

**It was under-confident in 2026.** Outcomes rated below about 35% happened less often than that;
outcomes rated above about 44% happened more often. Draws are excluded from that statement because 81
of 104 observations fall in one of three populated bins. See `docs/wc2026_postmortem.md`.

**Sparse bins.** Roughly 64 matches per tournament means reliability diagrams are noise-dominated at
the tails. The 2026 group max calibration error of 0.709 comes almost entirely from one single-match
bin.

**A small edge, not an oracle.** Both backtests sit within one sigma of a strong baseline. That is the
honest description: the model is calibrated and modestly skilful, and the methodology page says so in
those terms rather than in the language of certainty.

**Convergence is checked and has been recorded as not passing.**
`data/backtest/convergence.json` reads `"pass": false` at 10,000 iterations. Production runs at
50,000.

## Intended use

Publishing calibrated probabilities and being scored on them. It is not built for betting, and no
component models a market price, a margin or a stake.

# WC2026 post-mortem

How the model actually did across the 2026 tournament, including the direction in which it missed.
Every figure is in `data/backtest/wc2026_calibration.json` and can be read without running anything.

## Coverage first, because a score over a chosen subset is not a score

104 matches, 104 scored. `coverage_summary` records 72 of 72 group matches and 32 of 32 knockouts with
a clean pre-match run, and the `omitted` list is empty. The file's own description states that matches
without a clean pre-match run "are omitted, never imputed". None had to be.

That matters before any number below, because the easiest way to publish a good Brier score is to drop
the matches that went badly.

## The scores

| | group (n=72) | knockout (n=32) | all (n=104) |
|---|---|---|---|
| Brier | 0.5457 | 0.4886 | 0.5281 |
| log loss | 0.9201 | 0.8480 | 0.8979 |
| top-1 | 58.3% | 78.1% | 64.4% |
| top-2 | 87.5% | 87.5% | 87.5% |
| max calibration error | 0.7087 | 0.4863 | 0.7087 |

A uniform model scores 0.667. The group figures are identical whether taken from the frozen
pre-tournament run or the live walk-forward one, which is not a coincidence: a group result never
depends on another group's outcome, so live conditioning cannot move it.

## The honest read

**It beat both baselines and it sharpened on the knockouts.** Top-1 of 78.1% on 32 knockout matches
is the strongest single result here.

**On the group stage it was only modestly better than a uniform guess.** 0.5457 against 0.667 is a
real improvement and it is not a large one.

**The group max calibration error of 0.709 is almost entirely one bin.** A single match, predicted at
about 71%, that did not happen. With one observation the bin carries no information, and quoting the
0.709 without saying so would be misleading in the flattering direction as often as the unflattering
one.

## The direction of the miss, which is a separate claim from its size

**The model was under-confident, not over-confident.**

Its home-win and away-win probabilities sat too close to the middle of the range. Outcomes it rated
below about 35% happened less often than it said. Outcomes it rated above about 44% happened more
often. The starkest case: away wins rated 54% occurred 90% of the time, over 10 matches.

Read straight off the bins in `web/public/methodology/reliability_2026.csv`, which are the same bins
the published reliability diagram renders.

**Draws are deliberately given no direction.** Three of their bins are populated and 81 of the 104
observations sit in one of them. Three reasonable estimators disagree on the sign. An earlier internal
note put the draw slope at 1.56 as though it were a fact; it is not supported by this data and it is
not on the page.

**No fitted line is quoted, and that is on purpose.** The direction is estimator-dependent. A weighted
least-squares slope with an intercept gives home 1.67 and away 2.26; a ratio of weighted means gives
home 1.19 and away 0.89. Quoting a slope would be a claim about a choice of regression rather than
about the model, so the bins are quoted instead and they need no such choice.

## What this corrects

An external reviewer was told in writing that the methodology page "plainly states where the model was
overconfident". It did not, and the direction is the other way. The page said the reliability was
mixed and attributed the worst bin to a single-match sample: both true, neither directional. The
directional statement was added afterwards, and it says under-confident.

That sequence is recorded in `docs/incidents.md` as entry 6, because the failure was not the model's.
It was a claim made about the model's own published evidence without reading it.

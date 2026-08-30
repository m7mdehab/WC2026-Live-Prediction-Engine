# Presaira: the World Cup 2026 forecasting engine

A calibrated probabilistic forecast of every match of the 2026 FIFA World Cup, built on a Dixon-Coles
goal model blended with an Elo rating system and run through a 50,000-iteration Monte Carlo simulation
of the full tournament. It forecast all 104 matches and is scored on all 104, with nothing omitted.

The system is live at [presaira.com](https://presaira.com). The full technical account, rendered from
the artifacts in this repository, is at
[presaira.com/methodology](https://presaira.com/methodology).

**This repository is a curated extract from a larger private codebase.** What is here is the model,
the simulator, the tournament structure, the calibration artifacts, the World Cup site source, and the
tests that gate them. What is not here, and why, is at the end of this file. Nothing is here by
accident: `tools/publication_allowlist.py` lists every path that may exist, and
`tools/test_publication_allowlist.py` fails the build on any file that is not explicitly admitted.

---

## Orient in two minutes

| you want | go to |
|---|---|
| the goal model | [`model/dixon_coles.py`](model/dixon_coles.py) |
| the rating system | [`model/elo.py`](model/elo.py) |
| the fitted parameters actually used | [`model/dixon_coles_params.json`](model/dixon_coles_params.json), [`model/elo_ratings.csv`](model/elo_ratings.csv) |
| the tournament simulation | [`simulator/engine.py`](simulator/engine.py) |
| the FIFA Article 13 tie-break chain | [`simulator/tiebreakers.py`](simulator/tiebreakers.py) |
| the bracket it walks | [`data/tournament_structure_2026.json`](data/tournament_structure_2026.json) |
| how it actually did in 2026 | [`data/backtest/wc2026_calibration.json`](data/backtest/wc2026_calibration.json) |
| how it did on 2018 and 2022 before that | [`data/backtest/reliability_2018.csv`](data/backtest/reliability_2018.csv), [`data/backtest/reliability_2022.csv`](data/backtest/reliability_2022.csv) |
| whether it is honest about its misses | [`docs/wc2026_postmortem.md`](docs/wc2026_postmortem.md) |
| what went wrong along the way | [`docs/incidents.md`](docs/incidents.md) |
| what may be published at all | [`tools/publication_allowlist.py`](tools/publication_allowlist.py) |

## What runs in production

The live site reads a published forecast run from a Postgres database. A run is produced by fitting
the model to results strictly before a cutoff, simulating the tournament 50,000 times at a fixed seed,
and writing the outcome as one atomic row plus its probability tables. Finished match results are
ingested from several independent sources and written only when at least two of them agree; a
disagreement is withheld and flagged for a human rather than guessed.

The ingestion pipeline, the database layer and the publication path are **not** in this repository.
See "What is deliberately not here". The model and simulator that produce the numbers are.

## The claims, and where to check each one

Nothing in this section is asserted without a path. Where a line number is given it is the line in
this repository at the commit you are reading.

### A gate that can refuse to fire, and an instance where it held

`model/backtest.py`, `assert_pre_cutoff`, raises rather than returning a number when its input would
leak the future into a backtest:

```python
def assert_pre_cutoff(dates, cutoff):
    if (pd.Series(list(dates)) >= cutoff).any():
        raise AssertionError(f"leakage: row(s) with date >= {cutoff}")
```

The walk-forward champion backtest carries a second, stricter one in
`model/backtest_champion_convergence.py`, `assert_no_future_leak`. It refuses to pin any result from a
round later than the stage being simulated, and it refuses, at every stage without exception, to pin
the final:

```python
    if "f" in fixed_ids:
        raise AssertionError(f"leakage: stage {stage_key} pins the final result")
```

**An instance where a gate held, recorded rather than smoothed over.**
[`data/backtest/convergence.json`](data/backtest/convergence.json) is the committed output of the
Monte Carlo convergence check, and it reads `"pass": false`. The 10,000-iteration and
50,000-iteration champion probabilities differ by 0.634 percentage points on the top team against a
0.5 point target. The file records which team, both figures, the reason, and the remedy: run
production at 50,000 iterations, which is what the published forecast does. A failing check sits in
the repository, under its own name, with `pass` set to false.

### Guards proven non-vacuous, by feeding them input that must be rejected

A guard that has never been observed to fire is a guard nobody has tested. Five tests here do nothing
except feed a guard bad input and require it to go red:

| control | what it plants |
|---|---|
| [`tests/test_backtest.py:15`](tests/test_backtest.py#L15) | a date on the wrong side of the cutoff |
| [`tests/test_backtest_retro.py:64`](tests/test_backtest_retro.py#L64) | a retrodiction row from after its own stage |
| [`tests/test_champion_convergence.py:57`](tests/test_champion_convergence.py#L57) | a quarter-final result pinned at the post-round-of-16 stage |
| [`tests/test_champion_convergence.py:63`](tests/test_champion_convergence.py#L63) | the final pinned, at every stage in turn |
| [`tests/test_champion_odds.py:81`](tests/test_champion_odds.py#L81) | a champion-odds fit that reaches past its cutoff |

`tests/test_backtest.py` asserts both directions in the same test: the guard must raise on the leaking
input **and** must not raise on the clean one. A guard that rejects everything is as useless as one
that rejects nothing.

### A check that survives a reordering, not just a wrong answer

[`tests/test_tiebreakers_order.py`](tests/test_tiebreakers_order.py) exists because of a specific
finding, stated in its own docstring: an adapter that silently reorders a sort key passes every unit
test that only checks "the right team wins" on decisive inputs. So these tests construct groups where
every criterion but one is level, or points the other way, and a reordered chain therefore fails
rather than merely producing a different winner. It pins head-to-head before overall goal difference,
goal difference before goals scored, and the same ordering again for the third-placed table.

### Every published figure is checkable against a committed artifact

The methodology page's 2026 numbers come from
[`data/backtest/wc2026_calibration.json`](data/backtest/wc2026_calibration.json). Read the file and
compare:

| | group stage | knockout |
|---|---|---|
| n | 72 | 32 |
| Brier | 0.5457 | 0.4886 |
| log loss | 0.9201 | 0.8480 |
| top-1 | 58.3% | 78.1% |
| max calibration error | 0.7087 | 0.4863 |

`coverage_summary` reads 72 of 72 group matches and 32 of 32 knockouts covered, and `omitted` is an
empty list. The file's own description says matches without a clean pre-match run "are omitted, never
imputed", and none were.

The held-out and tuned backtests are in
[`data/backtest/reliability_2018.csv`](data/backtest/reliability_2018.csv),
[`data/backtest/reliability_2022.csv`](data/backtest/reliability_2022.csv),
[`data/backtest/wc2022_retro_metrics.json`](data/backtest/wc2022_retro_metrics.json) and
[`data/backtest/tuning_2022.json`](data/backtest/tuning_2022.json), which is the eight-step coordinate
descent the methodology page tabulates.

### The direction of the 2026 miss

The model was **under-confident, not over-confident**, and the live page says so in those words.
Outcomes it rated below about 35% happened less often than that; outcomes it rated above about 44%
happened more often, most starkly away wins rated 54% that occurred 90% of the time. Draws are
excluded from that statement on purpose: three of their bins are populated and 81 of 104 observations
fall in one of them, which is not enough to give the direction a sign. The bins are in
[`web/public/methodology/reliability_2026.csv`](web/public/methodology/reliability_2026.csv). Full
account in [`docs/wc2026_postmortem.md`](docs/wc2026_postmortem.md).

### Things that were plausible and turned out to be wrong

[`docs/incidents.md`](docs/incidents.md). Each entry names what was believed, why it was plausible,
how long it survived, and what finally caught it.

## Run it

```bash
git clone https://github.com/m7mdehab/WC2026-Live-Prediction-Engine.git
cd WC2026-Live-Prediction-Engine
python -m venv .venv && . .venv/bin/activate     # Windows: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pytest tests/ -q
```

The suite is creds-free by construction. Nothing in it reads a database, a network source or an
environment variable, so it passes on a fresh clone with no configuration. Verified from a clean
clone; the transcript is in
[`docs/reproducing_a_published_number.md`](docs/reproducing_a_published_number.md).

To run the publication gate, which is what CI runs first:

```bash
python -m pytest tools/test_publication_allowlist.py -q
```

## Reproducing a published number

Every prediction run records a ten-field provenance block, so any published forecast traces to the
exact model, code, data and seed that produced it. The block for the run currently on the site:

| field | value |
|---|---|
| `model_version` | `elo-dc-v1.0` |
| `simulator_version` | `shell-v0.1` |
| `data_version` | `2026-07-19` |
| `data_hash` | SHA-256 of the source results CSV |
| `rng_seed` | `42` |
| `training_cutoff_date` | `2026-06-10` |
| `calibration_method` | `none` |

`calibration_method: none` is a checked result rather than an omission: both Platt scaling and
isotonic regression were evaluated and both were rejected, isotonic for a 2.3% Brier regression on
2022. The trajectory is in `data/backtest/tuning_2022.json` and the verdicts in
`data/backtest/wc2026_calibration.json`.

Step by step reproduction of a specific figure, and what the seed does and does not pin, is in
[`docs/reproducing_a_published_number.md`](docs/reproducing_a_published_number.md).

## What is deliberately not here

The private repository also holds business strategy, unreleased brand systems, planning documents and
the operating instructions for the agents that build it. Rather than remove those one by one, this
repository admits only what is explicitly listed, and the rule runs on every push instead of being
applied once by hand.

**Not published, by category rather than by file:** a second competition's entire workstream; the
Presaira landing page and its design token system; every internal status document and working brief;
the business and planning documents; the Supabase pipeline, the ingestion scrapers and the database
layer; any environment file or credential.

**Four consequences you will notice, stated so they are not mistaken for oversights:**

- **The live pipeline is absent.** Ingestion, reconciliation, publication and the monitors all live in
  a directory that does not publish. You can fit the model, simulate the tournament and reproduce the
  backtests; you cannot reproduce a *live* run end to end.
- **Five test modules were removed rather than shipped broken.** Four ablation and readings suites
  need the player model, and one knockout dress-rehearsal suite needs the database layer. Neither
  publishes, so all five would fail to import on a clean clone. The twelve that remain pass.
- **The quorum logic is not here, and it is the one claim this README cannot evidence.** Two-source
  agreement with disagreements escalated to a human is real and it is tested, with fifteen negative
  controls. It is not published because its import chain reaches a network scraper and the player
  model through four files, and publishing it runnably would mean publishing those. Said here rather
  than claimed without a path.
- **`robots.ts` and `sitemap.ts` are absent.** Both enumerate the routes of two competitions from one
  place, so neither can be published without either including the other workstream or being rewritten
  into a file the private repository does not have.

One file diverges from its private original, and only one: `web/src/lib/data/events.ts` reads its
dispatch target from the environment instead of hardcoding a repository path. The reason is in a
comment at the top of that block.

## Licence

MIT. See [LICENSE](LICENSE).

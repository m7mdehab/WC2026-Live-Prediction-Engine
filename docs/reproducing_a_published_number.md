# Reproducing a published number

What the reproducibility block pins, what it does not, and the exact steps from a clean checkout to a
figure you can compare against the live site.

## The provenance block

Every prediction run records ten fields, so any published forecast traces to the model, code, data and
seed that produced it. The run currently serving presaira.com:

| field | value | what it pins |
|---|---|---|
| `model_version` | `elo-dc-v1.0` | the committed Elo and Dixon-Coles fit |
| `simulator_version` | `shell-v0.1` | the Monte Carlo engine and tie-break logic |
| `code_version` / `git_commit` | a commit in the private repository | the code the run was produced from |
| `data_version` | `2026-07-19` | snapshot date of the cleaned results dataset |
| `data_hash` | SHA-256 of the source results CSV | the exact input bytes |
| `rng_seed` | `42` | the Monte Carlo seed |
| `training_cutoff_date` | `2026-06-10` | matches on or before this fitted; nothing after leaks in |
| `data_cutoff_time` | as-of time once live results condition the run | null pre-tournament |
| `calibration_method` | `none` | assessed and rejected, see below |
| `run_type` | `manual_event` | a forecast run, not a data build or a backtest |

The block is rendered live on
[presaira.com/methodology](https://presaira.com/methodology) under "Reproducibility", read from the
published run rather than hardcoded, so it refreshes on every re-run.

## What the seed pins, and what it does not

`rng_seed: 42` fixes the Monte Carlo draws. Given identical fitted parameters, identical tournament
structure and identical known results, a re-run produces identical probabilities.

It does not pin the fit. The fit is a function of the training data and the cutoff, so a different
`data_version` or `training_cutoff_date` produces different parameters and therefore different
probabilities at the same seed. That is why the block records five things and not one.

It does not make 50,000 iterations exact. `data/backtest/convergence.json` measures the residual: at
10,000 iterations the top team's champion probability differs from its 50,000-iteration value by 0.634
percentage points, against a 0.5 point target, and the file records `"pass": false`. Production runs
at 50,000 for that reason. Two runs at the same seed and same iteration count agree exactly; a run at
a different iteration count does not, and the size of the disagreement is measured rather than assumed.

## What you can reproduce here, and what you cannot

**You can** fit the model, simulate the tournament, and reproduce every backtest figure the
methodology page quotes for 2018, 2022 and 2026. Those come from committed artifacts under
`data/backtest/` and from code in `model/` and `simulator/`.

**You cannot** reproduce a live run end to end. A live run reads results from a Postgres database,
conditions on them, and writes a new run row. The ingestion, reconciliation and publication code lives
in a directory that is not published. See the README under "What is deliberately not here".

This is stated rather than worked around. Instructions that fail on the reader's machine are worse
than instructions that say what they cannot do.

## Setup

```bash
git clone https://github.com/m7mdehab/WC2026-Live-Prediction-Engine.git
cd WC2026-Live-Prediction-Engine
python -m venv .venv
. .venv/bin/activate            # Windows: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Five pinned packages: pandas, numpy, scipy, scikit-learn and pytest. Nothing else is imported by the
published code. `matplotlib` is deliberately absent; see the note at the bottom of
`requirements.txt`.

## Run the suite

```bash
python -m pytest tests/ -q
```

Creds-free by construction. Nothing in the suite reads a database, a network source or an environment
variable, so it passes on a fresh clone with no configuration.

## Compare a published figure against a committed artifact

The most direct check, requiring no run at all:

```bash
python - <<'PY'
import json
d = json.load(open("data/backtest/wc2026_calibration.json"))
print("omitted:", d["omitted"])
print("coverage:", d["coverage_summary"])
for name in ("B_live_walkforward_group", "B_live_walkforward_ko"):
    a = d["analyses"][name]
    print(f"{name}: n={a['n']} brier={a['brier']:.4f} log_loss={a['log_loss']:.4f} top1={a['top1']:.4f}")
PY
```

Expected:

```
omitted: []
coverage: {'group_total': 72, 'group_covered_A': 72, 'group_covered_B': 72, 'ko_total': 32, 'ko_covered_B': 32}
B_live_walkforward_group: n=72 brier=0.5457 log_loss=0.9201 top1=0.5833
B_live_walkforward_ko: n=32 brier=0.4886 log_loss=0.8480 top1=0.7812
```

Those are the figures the methodology page renders as 0.546, 0.489, 58.3% and 78.1%, over 72 of 72 and
32 of 32 matches with none omitted.

## Verification transcript

See the section below, which records an actual clean-checkout run rather than an assurance that one
would work.

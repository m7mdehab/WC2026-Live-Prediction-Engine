# Gates that can refuse to fire

A gate is only meaningful if it can return "no". This file lists the gates in the published engine,
what each refuses, and where to find the test that proves it refuses.

The distinction that matters: a check that logs a warning and continues is not a gate. Every entry
below raises, and the caller cannot proceed past it.

## 1. The leakage guard on every backtest fit

**Refuses:** a fit whose training rows include any date on or after the cutoff.

**Where:** `model/backtest.py`, `assert_pre_cutoff`.

```python
def assert_pre_cutoff(dates, cutoff):
    if (pd.Series(list(dates)) >= cutoff).any():
        raise AssertionError(f"leakage: row(s) with date >= {cutoff}")
```

**Why it is a tripwire and not the mechanism.** The fits also truncate their own input. This exists
because truncation is a behaviour that can be changed by accident and a raise is not. The docstring
says so in the source.

**Proven to fire:** `tests/test_backtest.py:15` feeds it a date on the wrong side of the cutoff and
requires `AssertionError`. The same test then feeds clean input and requires no raise, because a guard
that rejects everything is as useless as one that rejects nothing.

## 2. The walk-forward stage guard

**Refuses:** pinning any result from a round later than the stage being simulated, and pinning the
final at any stage whatsoever.

**Where:** `model/backtest_champion_convergence.py`, `assert_no_future_leak`.

```python
    if "f" in fixed_ids:
        raise AssertionError(f"leakage: stage {stage_key} pins the final result")
```

**Why the second clause is separate.** The first clause is a general rule about round ordering. The
second is a specific refusal that does not depend on it: the answer the walk-forward analysis exists
to produce is who wins, so the final must stay unknown at every stage, including the last one before
it. Deriving that from the ordering rule alone would have made it a consequence rather than a
guarantee.

**Proven to fire:** `tests/test_champion_convergence.py:57` pins a quarter-final at the post-round-of-16
stage. `tests/test_champion_convergence.py:63` iterates every stage in turn and requires the final to
be refused in each.

## 3. The same tripwire, proven to fire from every backtest that depends on it

**Corrected while writing this file.** The first draft listed a separate cutoff guard inside
`model/backtest_champion_odds.py` and another inside `model/backtest_retro.py`. Reading the tests
showed both call `assert_pre_cutoff`, the guard in section 1. There are not four guards. There is one
guard with four call sites.

That is the stronger arrangement and it is worth saying why. Four independent implementations of the
same rule are four places for the rule to drift. One implementation, exercised from four different
backtests, drifts nowhere and is proven to fire in each context:

| context | control | what it plants |
|---|---|---|
| the fit itself | `tests/test_backtest.py:15` | a date on the wrong side of the cutoff |
| champion odds | `tests/test_champion_odds.py:81` | an in-tournament date against the opener |
| walk-forward retrodiction | `tests/test_backtest_retro.py:64` | a row from after the step's match date |
| champion convergence | `tests/test_champion_convergence.py:57` | a later round pinned at an earlier stage |

`tests/test_champion_odds.py:81` is worth reading in full, because the three assertions above it check
the training frame directly (`assert not (train.date >= opener).any()`) and then the fourth checks
that the tripwire would have caught it had those been wrong. Checking the property and separately
checking the checker is the pattern this file is about.

## 4. The Monte Carlo convergence check

**Refuses:** nothing, and it is listed here for a different reason.

`data/backtest/convergence.json` records the comparison of champion probabilities at 10,000 and 50,000
iterations against a 0.5 percentage point target, and it reads `"pass": false`. It is the one gate
here whose recorded answer is a failure, and it is published as a failure with the team named, both
figures given, the cause identified as Monte Carlo noise on the largest probability, and the remedy
stated: production runs at 50,000 iterations.

A gate list with no failures in it is a list nobody has run.

## 5. The tie-break ordering pins

**Refuses:** a tie-break chain whose criteria are in the wrong order, even when it still picks the
right winner.

**Where:** `tests/test_tiebreakers_order.py` against `simulator/tiebreakers.py`.

This is not a raise, it is a test design, and it is here because the failure mode it addresses defeats
every ordinary test. An adapter that silently reorders a sort key passes anything that checks "the
right team wins" on a decisive input, because on a decisive input several orderings agree. These tests
construct groups where every criterion but one is level, or points the other way, so a reordered chain
fails rather than merely producing a different winner.

It pins head-to-head before overall goal difference, goal difference before goals scored, and the same
ordering again for the third-placed table.

## What is not here

The player evaluation gate, the publication guard and the two-source quorum gate are real and are
tested, and none of them is in this repository. They belong to the live pipeline and to a second
competition's workstream, neither of which publishes. They are named in `README.md` under "What is
deliberately not here" rather than claimed here without a path.

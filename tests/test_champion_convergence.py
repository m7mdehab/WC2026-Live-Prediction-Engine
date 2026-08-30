"""Tests for the walk-forward champion-odds convergence backtest (WC2018/WC2022): leakage at each
stage, determinism (seed 42), the eventual champion's per-stage rank is recorded and either monotone
or explained, the conditioning uses ONLY actual results up to the stage, and the committed artifacts
match the recomputed values. Offline.

Run from repo root:  python -m pytest tests/test_champion_convergence.py -v
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from model.backtest_champion_odds import BRACKET, build_structure, BacktestSampler
from model.backtest_champion_convergence import (
    ACTUAL,
    ROUND_OF,
    STAGES,
    WINNERS,
    assert_no_future_leak,
    conditioned_champion_odds,
    remaining_field,
    run_year,
    simulate_once_conditioned,
)
from model.backtest_retro import chosen_config
from model.elo import load_altitude

ROOT = Path(__file__).resolve().parents[1]
CLEAN = ROOT / "data" / "historical_results_clean.csv"
BT_DIR = ROOT / "data" / "backtest"


@pytest.fixture(scope="module")
def env():
    df = pd.read_csv(CLEAN, encoding="utf-8")
    return df, load_altitude(), chosen_config()


def _sampler(struct):
    params = {"intercept_c": 0.1, "home_advantage": 0.3, "rho": -0.05,
              "teams": {t: {"attack": 0.0, "defense": 0.0} for t in struct["all_teams"]}}
    return BacktestSampler(params, host=None)


# ---- leakage: each stage pins only results up to that round; final never pinned ------------------
@pytest.mark.parametrize("stage_key,fixed_ids", [(s[0], s[2]) for s in STAGES])
def test_no_future_leak_passes_for_valid_stage(stage_key, fixed_ids):
    assert_no_future_leak(stage_key, fixed_ids)  # must not raise


def test_no_future_leak_catches_later_round():
    # pinning a QF result at the post-R16 stage is a future leak
    with pytest.raises(AssertionError):
        assert_no_future_leak("post_r16", ["r1", "q1"])


def test_no_future_leak_never_allows_pinning_the_final():
    for stage_key, _label, _fixed in STAGES:
        with pytest.raises(AssertionError):
            assert_no_future_leak(stage_key, ["f"])


@pytest.mark.parametrize("year", ["2018", "2022"])
def test_fixed_ids_only_reference_at_or_before_stage(year):
    # the conditioning data for every stage references only rounds at/before it (structural leakage)
    order = {"round_of_16": 1, "quarter_final": 2, "semi_final": 3, "final": 4}
    cap = {"pre": 0, "post_r16": 1, "post_qf": 2, "post_sf": 3}
    for stage_key, _label, fixed_ids in STAGES:
        for mid in fixed_ids:
            assert order[ROUND_OF[mid]] <= cap[stage_key]


# ---- determinism (seed 42) -----------------------------------------------------------------------
def test_determinism_same_seed():
    s = build_structure("2022")
    smp = _sampler(s)
    p1 = conditioned_champion_odds(s, smp, ACTUAL["2022"], list(STAGES[1][2]), iters=600, seed=42)
    p2 = conditioned_champion_odds(s, smp, ACTUAL["2022"], list(STAGES[1][2]), iters=600, seed=42)
    assert p1 == p2
    assert sum(p1.values()) == pytest.approx(1.0, abs=1e-9)


# ---- conditioning: pinned matches always yield their actual winner -------------------------------
@pytest.mark.parametrize("year", ["2018", "2022"])
def test_conditioned_sim_respects_actual_winners(year):
    # at post-SF, the only unresolved match is the final, so the champion must be one of the two
    # actual finalists, every time, regardless of the RNG.
    s = build_structure(year)
    smp = _sampler(s)
    actual = ACTUAL[year]
    finalists = {actual["s1"], actual["s2"]}
    fixed = list(STAGES[3][2])  # post_sf
    rng = np.random.default_rng(123)
    for _ in range(50):
        champ = simulate_once_conditioned(s, smp, actual, fixed, rng)
        assert champ in finalists


# ---- remaining field shrinks 16 -> 8 -> 4 -> 2 and always contains the actual champion -----------
@pytest.mark.parametrize("year", ["2018", "2022"])
def test_remaining_field_sizes_and_membership(year):
    actual = ACTUAL[year]
    expected = {"pre": 16, "post_r16": 8, "post_qf": 4, "post_sf": 2}
    for stage_key, _label, fixed_ids in STAGES:
        alive = remaining_field(actual, fixed_ids)
        assert len(alive) == expected[stage_key]
        assert WINNERS[year] in alive


# ---- bracket actuals reproduce the real R16 pairings (sanity vs the known draw) ------------------
def test_actual_r16_matches_real_2018_pairings():
    a = ACTUAL["2018"]

    def resolve(slot):
        return a["winner"][slot[1]] if slot[0] == "1" else a["runner"][slot[1]]

    r16 = {frozenset({resolve(x), resolve(y)})
           for mid, st, x, y in BRACKET if st == "round_of_16"}
    real = [{"Uruguay", "Portugal"}, {"France", "Argentina"}, {"Brazil", "Mexico"},
            {"Belgium", "Japan"}, {"Spain", "Russia"}, {"Croatia", "Denmark"},
            {"Sweden", "Switzerland"}, {"Colombia", "England"}]
    for pair in real:
        assert frozenset(pair) in r16


# ---- the per-stage champion rank is recorded and monotone-or-explained ---------------------------
@pytest.mark.parametrize("year", ["2018", "2022"])
def test_rank_trajectory_recorded_and_monotone_or_explained(env, year):
    df, alt, cfg = env
    rep = run_year(year, df, alt, cfg, iters=2000, seed=42)
    ranks = rep["champion_rank_trajectory"]
    assert len(ranks) == len(STAGES)
    assert all(isinstance(r, int) and r >= 1 for r in ranks)
    mono = all(ranks[i + 1] <= ranks[i] for i in range(len(ranks) - 1))
    assert rep["rank_trajectory_monotone"] == mono
    # if not monotone, the honest_read must flag the non-monotone trajectory
    if not mono:
        assert "non-monotone" in rep["honest_read"]
    # final stage: champion ranks among the two finalists (rank 1 or 2)
    assert ranks[-1] in (1, 2)


# ---- determinism across full run_year (seed 42) --------------------------------------------------
def test_run_year_deterministic(env):
    df, alt, cfg = env
    r1 = run_year("2018", df, alt, cfg, iters=1500, seed=42)
    r2 = run_year("2018", df, alt, cfg, iters=1500, seed=42)
    assert r1["champion_rank_trajectory"] == r2["champion_rank_trajectory"]
    assert r1["stages"] == r2["stages"]


# ---- committed artifacts exist and match recomputed values (full iters) --------------------------
@pytest.mark.parametrize("year", ["2018", "2022"])
def test_committed_artifact_matches(env, year):
    path = BT_DIR / f"wc{year}_champion_convergence.json"
    assert path.exists(), f"missing artifact {path}"
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved["eventual_champion"] == WINNERS[year]
    assert saved["seed"] == 42
    # ranks present per stage, descending toward the final (monotone for both committed years)
    ranks = saved["champion_rank_trajectory"]
    assert len(ranks) == 4
    # recompute at the committed iters and confirm the trajectory is identical (determinism on disk)
    df, alt, cfg = env
    rep = run_year(year, df, alt, cfg, iters=saved["iters"], seed=saved["seed"])
    assert rep["champion_rank_trajectory"] == ranks
    assert rep["became_number_one_at"] == saved["became_number_one_at"]


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))

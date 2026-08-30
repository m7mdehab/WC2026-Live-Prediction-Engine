"""Phase 2.5 - WC2022 walk-forward retrodiction: look-ahead guard, determinism, metric helpers.

A reviewer attacks the look-ahead guard and determinism, so those are the heavy tests. The
metric helpers are checked against hand-computed values.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from model import metrics as M
from model.backtest import assert_pre_cutoff
from model.backtest_retro import (
    chosen_config,
    run_retrodiction,
    training_dates_for_step,
    wc2022_matches,
    walk_forward,
    write_artifacts,
    spearman_strength_vs_finish,
    load_data,
)


# --------------------------------------------------------------- fixtures (load once)
@pytest.fixture(scope="module")
def data():
    return load_data()   # (df, altitude)


@pytest.fixture(scope="module")
def matches(data):
    return wc2022_matches(data[0])


# --------------------------------------------------------------- LOOK-AHEAD GUARD (critical)
def test_early_step_training_excludes_the_final(data, matches):
    """For an early WC2022 step (the opener, step 0), the training frame must EXCLUDE the 2022
    final Argentina-France (2022-12-18) and every other later WC2022 result."""
    df = data[0]
    train_dates = training_dates_for_step(df, matches, step=0)
    # the final's date is strictly after every training date
    assert (train_dates < "2022-11-20").all()
    assert "2022-12-18" not in set(train_dates)
    # and a known later WC2022 result (final) is not in the frame
    final_mask = (df.date == "2022-12-18") & (df.home_team_canon == "Argentina") \
        & (df.away_team_canon == "France")
    assert final_mask.any(), "sanity: the final must exist in the dataset"
    leaked = df[final_mask]
    assert leaked["date"].iloc[0] not in set(train_dates)


def test_deliberately_leaked_frame_raises(data, matches):
    """If the final's row leaks into an early step's training frame, assert_pre_cutoff must RAISE
    against that step's match date. This proves the tripwire actually fires."""
    df = data[0]
    cutoff = matches.iloc[0]["date"]   # opener date
    clean = training_dates_for_step(df, matches, step=0)
    assert_pre_cutoff(clean, cutoff)   # clean frame does not raise
    leaked = pd.concat([clean, pd.Series(["2022-12-18"])], ignore_index=True)
    with pytest.raises(AssertionError):
        assert_pre_cutoff(leaked, cutoff)


def test_walk_forward_runs_guard_every_step(data, matches):
    """The walk-forward fit must never see a row on/after the step's match date. We re-derive the
    training frame per step and assert it is strictly pre-cutoff (same check the code runs)."""
    df = data[0]
    for k in range(len(matches)):
        cutoff = matches.iloc[k]["date"]
        td = training_dates_for_step(df, matches, k)
        assert (td < cutoff).all()
        assert_pre_cutoff(td, cutoff)   # would raise on leakage


# --------------------------------------------------------------- monotonic cutoff
def test_training_max_date_monotonic_and_strict(data, matches):
    df, alt = data
    cfg = chosen_config()
    _, _, rows = walk_forward(df, alt, matches, cfg, update=True)
    prev = ""
    for r in rows:
        assert r["training_max_date"] < r["date"], "training_max_date must be < match date"
        assert r["training_max_date"] >= prev, "training_max_date must be non-decreasing"
        prev = r["training_max_date"]
    # in-tournament updating actually increases the cutoff during the tournament
    assert rows[-1]["training_max_date"] > rows[0]["training_max_date"]


# --------------------------------------------------------------- determinism
def test_retrodiction_deterministic(data, matches):
    """Two full walk-forward runs (seed 42) produce byte-identical metrics."""
    df, alt = data
    cfg = chosen_config()
    r1 = run_retrodiction(df, alt, matches, cfg, update=True)
    r2 = run_retrodiction(df, alt, matches, cfg, update=True)
    key = ("brier", "log_loss", "mae", "top1_hit_rate", "top2_hit_rate", "max_calibration_error")
    j1 = json.dumps({k: r1[k] for k in key}, sort_keys=True)
    j2 = json.dumps({k: r2[k] for k in key}, sort_keys=True)
    assert j1 == j2
    assert np.array_equal(r1["P"], r2["P"])


def test_static_vs_walkforward_differ(data, matches):
    """Sanity: the static (no-update) run and the walk-forward run are NOT identical - in-tourney
    updating must actually change at least some predictions (otherwise the ablation is vacuous)."""
    df, alt = data
    cfg = chosen_config()
    wf = run_retrodiction(df, alt, matches, cfg, update=True)
    st = run_retrodiction(df, alt, matches, cfg, update=False)
    assert not np.allclose(wf["P"], st["P"])


# --------------------------------------------------------------- metric helpers (known values)
def test_top_n_hit_rate_known():
    # match 0: probs [0.6,0.3,0.1], actual home(0) -> top1 hit, top2 hit
    # match 1: probs [0.2,0.5,0.3], actual away(2) -> top1 miss, top2 hit (away is 2nd)
    # match 2: probs [0.7,0.2,0.1], actual away(2) -> top1 miss, top2 miss (away is least)
    P = np.array([[0.6, 0.3, 0.1], [0.2, 0.5, 0.3], [0.7, 0.2, 0.1]])
    Y = np.array([0, 2, 2])
    assert abs(M.top_n_hit_rate(P, Y, 1) - 1 / 3) < 1e-12
    assert abs(M.top_n_hit_rate(P, Y, 2) - 2 / 3) < 1e-12


def test_top_n_hit_rate_n3_is_one():
    P = np.array([[0.6, 0.3, 0.1], [0.2, 0.5, 0.3]])
    Y = np.array([2, 0])
    assert M.top_n_hit_rate(P, Y, 3) == 1.0   # all classes always covered


def test_mae_onehot_known():
    # one match, predict [0.5,0.3,0.2], actual home(0): |0.5-1|+|0.3-0|+|0.2-0| = 0.5+0.3+0.2=1.0
    # averaged over 3 classes = 1.0/3
    P = np.array([[0.5, 0.3, 0.2]])
    Y = np.array([0])
    assert abs(M.mae_onehot(P, Y) - (1.0 / 3)) < 1e-12
    # perfect prediction -> 0
    assert M.mae_onehot(np.array([[1.0, 0.0, 0.0]]), np.array([0])) == 0.0


def test_spearman_known_values():
    # perfectly monotonic increasing -> +1
    a = np.array([1.0, 2.0, 3.0, 4.0])
    b = np.array([10.0, 20.0, 30.0, 40.0])
    assert abs(M.spearman(a, b) - 1.0) < 1e-12
    # perfectly anti-monotonic -> -1
    assert abs(M.spearman(a, b[::-1]) + 1.0) < 1e-12
    # a worked example with one rank swap: classic rho = 0.7 case (n=4)
    # x ranks 1,2,3,4 ; y ranks 1,2,4,3 -> d^2 = 0+0+1+1 = 2 ; rho = 1 - 6*2/(4*15) = 1-0.2 = 0.8
    x = np.array([1.0, 2.0, 3.0, 4.0])
    y = np.array([1.0, 2.0, 4.0, 3.0])
    assert abs(M.spearman(x, y) - 0.8) < 1e-9


def test_spearman_ties_average_rank():
    # ties: x = [1,1,2,2], y = [1,1,2,2] -> identical ordering, rho = +1
    x = np.array([1.0, 1.0, 2.0, 2.0])
    y = np.array([1.0, 1.0, 2.0, 2.0])
    assert abs(M.spearman(x, y) - 1.0) < 1e-12


def test_spearman_constant_returns_zero():
    a = np.array([5.0, 5.0, 5.0])
    b = np.array([1.0, 2.0, 3.0])
    assert M.spearman(a, b) == 0.0


# --------------------------------------------------------------- spearman target sign
def test_spearman_strength_vs_finish_positive(data):
    """Stronger pre-tournament teams should finish higher -> positive rho on (strength,-finish).
    This is a directional sanity check, not a tight threshold."""
    df, alt = data
    spear = spearman_strength_vs_finish(df, alt, chosen_config())
    assert spear["n_teams"] == 32
    assert spear["rho_strength_vs_finish"] > 0.3


# --------------------------------------------------------------- artifacts written
def test_artifacts_written(data, matches, tmp_path):
    df, alt = data
    cfg = chosen_config()
    headline = run_retrodiction(df, alt, matches, cfg, update=True)
    spear = spearman_strength_vs_finish(df, alt, cfg)
    # Write into tmp_path, NOT the repo BT_DIR: the committed data/backtest artifact is produced by
    # model.backtest_retro.main() (full ablations) and must never be clobbered by this test.
    write_artifacts(headline, spear, {"a_tuned_walkforward": {
        "brier": headline["brier"], "log_loss": headline["log_loss"], "mae": headline["mae"],
        "top1_hit_rate": headline["top1_hit_rate"], "top2_hit_rate": headline["top2_hit_rate"],
        "max_calibration_error": headline["max_calibration_error"], "n": headline["n"]}},
        out_dir=tmp_path)
    assert (tmp_path / "wc2022_retro_predictions.csv").exists()
    assert (tmp_path / "wc2022_retro_metrics.json").exists()
    pred = pd.read_csv(tmp_path / "wc2022_retro_predictions.csv")
    assert len(pred) == 64
    assert set(["date", "home_team", "away_team", "p_home", "p_draw", "p_away",
                "outcome", "training_rows_used", "training_max_date"]).issubset(pred.columns)

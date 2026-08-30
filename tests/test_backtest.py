"""Phase 2.4 -- leakage guard, metric formulas, reliability bins."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from model import metrics as M
from model.backtest import assert_pre_cutoff
from model.elo import compute_elo


# ---------------------------------------------------------------- leakage guard
def test_assert_pre_cutoff_raises_on_future_row():
    with pytest.raises(AssertionError):
        assert_pre_cutoff(["2019-01-01", "2022-12-01"], "2022-11-20")
    # clean input does not raise
    assert_pre_cutoff(["2019-01-01", "2022-11-19"], "2022-11-20")


def test_compute_elo_truncates_at_fit_max_date():
    rows = [
        ["2019-06-01", "A", "B", 1, 0, True, 1.0, 5, "data"],
        ["2021-06-01", "C", "D", 2, 1, True, 1.0, 5, "data"],  # after cutoff -> excluded
    ]
    cols = ["date", "home_team_canon", "away_team_canon", "home_score", "away_score",
            "neutral", "tournament_weight", "tournament_tier", "competition_category"]
    df = pd.DataFrame(rows, columns=cols)
    ratings, _ = compute_elo(df, fit_max_date="2020-01-01")
    teams = set(ratings.team)
    assert "A" in teams and "B" in teams
    assert "C" not in teams and "D" not in teams          # post-cutoff teams never seen
    assert (ratings["last_match_date"] < "2020-01-01").all()


# ---------------------------------------------------------------- metric formulas
def test_brier_known_values():
    # perfect prediction -> 0; one match, predict [1,0,0], actual home win
    assert M.multiclass_brier(np.array([[1.0, 0.0, 0.0]]), np.array([0])) == 0.0
    # uniform prediction, actual home: (1/3-1)^2 + (1/3)^2 + (1/3)^2 = 2/3
    b = M.multiclass_brier(np.array([[1 / 3, 1 / 3, 1 / 3]]), np.array([0]))
    assert abs(b - 2 / 3) < 1e-9
    # worst case: predict away, actual home -> (0-1)^2 + 0 + (1-0)^2 = 2
    assert abs(M.multiclass_brier(np.array([[0.0, 0.0, 1.0]]), np.array([0])) - 2.0) < 1e-9


def test_log_loss_known_values():
    # predict 0.5 on the actual class -> -ln 0.5
    ll = M.log_loss(np.array([[0.5, 0.25, 0.25]]), np.array([0]))
    assert abs(ll - (-np.log(0.5))) < 1e-9
    # clipping: predict 0 on actual -> -ln(1e-6)
    ll2 = M.log_loss(np.array([[0.0, 0.5, 0.5]]), np.array([0]))
    assert abs(ll2 - (-np.log(1e-6))) < 1e-6


def test_outcome_mapping():
    assert M.outcome(2, 1) == 0 and M.outcome(1, 1) == 1 and M.outcome(0, 2) == 2


# ---------------------------------------------------------------- reliability bins
def test_reliability_bins_perfectly_calibrated():
    rng = np.random.default_rng(0)
    n = 20000
    p = rng.uniform(0, 1, n)
    hit = (rng.uniform(0, 1, n) < p).astype(float)   # observed freq == predicted, by construction
    rows = M.reliability_bins(p, hit, n_bins=10)
    assert sum(r["n"] for r in rows) == n
    for r in rows:
        if r["n"] > 100:
            assert abs(r["mean_pred"] - r["obs_freq"]) < 0.05   # well-calibrated


def test_reliability_bin_assignment_counts():
    p = np.array([0.05, 0.15, 0.95, 0.999, 0.0])
    hit = np.array([0.0, 1.0, 1.0, 1.0, 0.0])
    rows = M.reliability_bins(p, hit, n_bins=10)
    assert rows[0]["n"] == 2      # 0.05 and 0.0 -> first bin
    assert rows[1]["n"] == 1      # 0.15
    assert rows[9]["n"] == 2      # 0.95 and 0.999 -> last bin

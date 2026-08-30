"""Phase 3a -- pure, creds-free unit tests for the calibration core.

These exercise ONLY compute_calibration() (a deterministic function of its (P, Y) inputs) and the
outcome mapping. No Supabase, no clock, no RNG except a FIXED numpy seed. Mirrors tests/test_backtest.py
style; the DB-touching path lives in main() and is not exercised here, so this passes in creds-free CI.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from calibration_backtest import compute_calibration  # noqa: E402
from model import metrics as M  # noqa: E402


# ---------------------------------------------------------------- 1. perfect-calibration recovery
def test_perfectly_calibrated_recovery():
    """p ~ U(0,1); home win ~ Bernoulli(p). Every populated home_win bin must have obs_freq within
    0.05 of mean_pred, and the per-class bin counts must sum to N."""
    rng = np.random.default_rng(12345)
    n = 20000
    p = rng.uniform(0.0, 1.0, n)
    home = rng.uniform(0.0, 1.0, n) < p          # observed freq == predicted, by construction
    other = rng.integers(1, 3, n)                # non-home outcome is draw(1) or away(2)
    Y = np.where(home, 0, other)
    P = np.column_stack([p, (1.0 - p) / 2.0, (1.0 - p) / 2.0])

    res = compute_calibration(P, Y)
    hw = res["reliability"]["home_win"]
    assert sum(b["n"] for b in hw) == n
    for b in hw:
        if b["n"] > 0:
            assert abs(b["mean_pred"] - b["obs_freq"]) < 0.05
    assert res["n"] == n


# ---------------------------------------------------------------- 2. known miscalibration recovery
def test_known_overconfidence_recovery():
    """Report p but generate home at p/2 (2x overconfident). Recovered obs_freq must be ~ mean_pred/2,
    and the max calibration error must land near the top-bin gap (~0.475)."""
    rng = np.random.default_rng(999)
    n = 40000
    p = rng.uniform(0.0, 1.0, n)
    home = rng.uniform(0.0, 1.0, n) < (p / 2.0)  # TRUE home rate is half the reported prob
    Y = np.where(home, 0, 2)                      # non-home -> away, so draw stays exactly 0
    P = np.column_stack([p, np.zeros(n), 1.0 - p])

    res = compute_calibration(P, Y)
    for b in res["reliability"]["home_win"]:
        if b["n"] > 200:
            assert abs(b["obs_freq"] - b["mean_pred"] / 2.0) < 0.05
    # top home bin ~0.95 reported vs ~0.475 observed => gap ~0.475 (away side is symmetric).
    assert 0.40 < res["max_calibration_error"] < 0.52


# ---------------------------------------------------------------- 3. closed-form Brier / log loss
def test_closed_form_brier_and_log_loss():
    # perfect -> Brier 0, log loss ~ 0 (clip makes -ln(1-1e-6) ~ 1e-6)
    r = compute_calibration(np.array([[1.0, 0.0, 0.0]]), np.array([0]))
    assert abs(r["brier"]) < 1e-12
    assert r["log_loss"] < 1e-5
    # uniform -> Brier 2/3, log loss -ln(1/3)
    r = compute_calibration(np.array([[1 / 3, 1 / 3, 1 / 3]]), np.array([0]))
    assert abs(r["brier"] - 2 / 3) < 1e-9
    assert abs(r["log_loss"] - (-np.log(1 / 3))) < 1e-9
    # worst -> Brier 2, log loss clipped to -ln(1e-6)
    r = compute_calibration(np.array([[0.0, 0.0, 1.0]]), np.array([0]))
    assert abs(r["brier"] - 2.0) < 1e-9
    assert abs(r["log_loss"] - (-np.log(1e-6))) < 1e-6
    # p=0.5 on the actual class -> -ln(0.5)
    r = compute_calibration(np.array([[0.5, 0.25, 0.25]]), np.array([0]))
    assert abs(r["log_loss"] - (-np.log(0.5))) < 1e-9


# ---------------------------------------------------------------- 4. base-rate baseline + Brier skill
def test_base_rate_baseline_and_brier_skill():
    Y = np.array([0] * 50 + [1] * 30 + [2] * 20)  # marginals exactly [0.5, 0.3, 0.2]

    P_perfect = np.zeros((100, 3))
    P_perfect[np.arange(100), Y] = 1.0
    r = compute_calibration(P_perfect, Y)
    assert np.allclose(r["base_rate"], [0.5, 0.3, 0.2], atol=1e-12)
    assert np.allclose(r["baselines"]["base_rate"]["p"], [0.5, 0.3, 0.2], atol=1e-12)
    # base-rate baseline Brier hand value: sum(f^2)=0.38 -> mean(1.38 - 2*p_actual) = 0.62
    assert abs(r["baselines"]["base_rate"]["brier"] - 0.62) < 1e-9
    assert abs(r["baselines"]["uniform"]["brier"] - 2 / 3) < 1e-9
    # perfect model -> Brier 0 -> skill vs base-rate = 1
    assert abs(r["brier"]) < 1e-12
    assert abs(r["baselines"]["base_rate"]["brier_skill_score"] - 1.0) < 1e-9

    # non-perfect model = uniform -> Brier 2/3 -> skill = 1 - (2/3)/0.62 (negative: worse than base)
    r2 = compute_calibration(np.tile([1 / 3, 1 / 3, 1 / 3], (100, 1)), Y)
    assert abs(r2["brier"] - 2 / 3) < 1e-9
    assert abs(r2["baselines"]["base_rate"]["brier_skill_score"] - (1 - (2 / 3) / 0.62)) < 1e-9
    assert abs(r2["baselines"]["uniform"]["brier_skill_score"] - 0.0) < 1e-9


# ---------------------------------------------------------------- 5. outcome mapping
def test_outcome_mapping():
    assert M.outcome(2, 1) == 0
    assert M.outcome(1, 1) == 1
    assert M.outcome(0, 2) == 2

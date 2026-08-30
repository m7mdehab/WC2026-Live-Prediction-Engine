"""Phase 2.2/2.3 Dixon-Coles tests: parameter recovery, rho direction, engine wiring."""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize

from model.dixon_coles import FitData, neg_log_likelihood, score_matrix
from simulator.engine import monte_carlo, simulate_once
from simulator.loaders import load
from simulator.model_sampler import DixonColesSampler


def test_recovers_known_strengths():
    rng = np.random.default_rng(0)
    n = 10
    a_true = rng.normal(0, 0.4, n); a_true -= a_true.mean()
    d_true = rng.normal(0, 0.4, n); d_true -= d_true.mean()
    c_true, h_true = 0.3, 0.3

    m = 9000
    home = rng.integers(0, n, m); away = rng.integers(0, n, m)
    keep = home != away; home, away = home[keep], away[keep]; m = len(home)
    hh = rng.integers(0, 2, m).astype(float)
    lam = np.exp(c_true + a_true[home] - d_true[away] + h_true * hh)
    mu = np.exp(c_true + a_true[away] - d_true[home])
    x = rng.poisson(lam); y = rng.poisson(mu)
    w = np.ones(m)
    zeros = np.zeros(m)
    data = FitData([f"T{i}" for i in range(n)], home, away, x, y, w, hh,
                   home_burden=zeros, away_burden=zeros,   # no altitude in this synthetic
                   m_target=np.zeros(n))                    # no prior info; recover from data

    theta0 = np.zeros(2 * n + 4); theta0[2 * n] = 0.3; theta0[2 * n + 1] = 0.3
    # altitude_coef unidentified with zero burdens -> pin to 0
    bounds = [(None, None)] * (2 * n) + [(None, None), (-0.5, 1.0), (0.0, 0.0), (-0.2, 0.1)]
    res = minimize(neg_log_likelihood, theta0, args=(data,), jac=True, method="L-BFGS-B",
                   bounds=bounds)
    a = res.x[:n] - res.x[:n].mean()
    d = res.x[n:2 * n] - res.x[n:2 * n].mean()
    h = res.x[2 * n + 1]

    assert np.corrcoef(a, a_true)[0, 1] > 0.9
    assert np.corrcoef(d, d_true)[0, 1] > 0.9
    assert np.sqrt(np.mean((a - a_true) ** 2)) < 0.15
    assert abs(h - h_true) < 0.10


def test_rho_shifts_low_scores():
    lam, mu = 1.4, 1.1
    base = score_matrix(lam, mu, 0.0, 8)
    neg = score_matrix(lam, mu, -0.1, 8)
    # rho<0 raises P(0-0) and P(1-1), lowers P(0-1) and P(1-0)
    assert neg[0, 0] > base[0, 0]
    assert neg[1, 1] > base[1, 1]
    assert neg[0, 1] < base[0, 1]
    assert neg[1, 0] < base[1, 0]
    # still a valid distribution
    assert abs(neg.sum() - 1.0) < 1e-9 and (neg >= 0).all()


def test_dc_sampler_runs_through_engine():
    data = load()
    sampler = DixonColesSampler()
    rng = np.random.default_rng(1)
    res = simulate_once(data, sampler, rng)
    assert len(res.qualified) == 32
    assert res.champion in data.all_teams
    for mid, a, b in res.r32_pairings:
        assert data.team_group[a] != data.team_group[b]   # interface contract still holds


def test_dc_strong_teams_favoured():
    data = load()
    probs, _, _ = monte_carlo(data, DixonColesSampler(), 200, 7)
    champ = sum(probs[t]["champion"] for t in data.all_teams)
    assert abs(champ - 1.0) < 1e-9
    # elite sides should out-rank minnows on champion probability
    elite = np.mean([probs[t]["champion"] for t in ("Spain", "Argentina", "France", "Brazil", "England")])
    weak = np.mean([probs[t]["champion"] for t in ("Haiti", "New Zealand", "Curaçao")])
    assert elite > weak

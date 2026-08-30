"""Phase 2.2 / 2.3 (+ Phase 2 refinement) -- Dixon-Coles match model.

Model. For a match between home team i and away team j:
    log λ = c + attack_i - defense_j + h·home_i - altitude_coef·burden_i
    log μ = c + attack_j - defense_i + h·home_j - altitude_coef·burden_j
  c              league-average log goal rate (intercept)
  attack/defense team deviations
  h              single home/host-advantage coefficient (Phase 2.3)
  altitude_coef  FITTED universal altitude penalty (Phase 2 refinement, sign-constrained
                 to [0, 0.5]); burden(team) = max(0, venue_alt - team_home_alt)/1000 km,
                 venue_alt = home-team altitude on non-neutral matches else 0. A visitor to
                 altitude scores fewer goals, so altitude home wins stop over-crediting the
                 home side's attack/defense. altitude is team-level (team_home_altitude.csv).
  Score pmf uses the Dixon-Coles low-score correction τ(x,y;λ,μ,ρ).

Fit. Weighted MLE, weights = tournament_weight · exp(-ξ·age_days), ξ = ln2/HALF_LIFE_DAYS,
age relative to `as_of` (= fit_max_date for backtests, else the build cutoff). An Elo prior
pulls each team's net strength (attack+defense) toward its Elo-implied strength. L-BFGS-B
with an analytic gradient (verified by scipy.optimize.check_grad, including the altitude term).

Judgment calls (tunable; chosen in phase_2_refinement_notes.md):
  HALF_LIFE_DAYS=730, STRENGTH_SCALE=0.5, LAMBDA_PRIOR=5.0, LAMBDA_RIDGE=1e-3,
  FIT_MIN_DATE=2008-01-01, RHO∈[-0.2,0.1], h∈[-0.5,1.0], altitude_coef∈[0,0.5].

Output: model/dixon_coles_params.json.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize

ROOT = Path(__file__).resolve().parents[1]
CLEAN = ROOT / "data" / "historical_results_clean.csv"
ELO = ROOT / "model" / "elo_ratings.csv"
ALTITUDE_CSV = ROOT / "data" / "team_home_altitude.csv"
OUT = ROOT / "model" / "dixon_coles_params.json"

CUTOFF = date(2026, 6, 10)
HALF_LIFE_DAYS = 730.0
XI = math.log(2.0) / HALF_LIFE_DAYS
STRENGTH_SCALE = 0.5
LAMBDA_PRIOR = 5.0
LAMBDA_RIDGE = 1e-3
FIT_MIN_DATE = "2008-01-01"
RHO_BOUNDS = (-0.2, 0.1)
H_BOUNDS = (-0.5, 1.0)
AC_BOUNDS = (0.0, 0.5)
TAU_FLOOR = 1e-8

# Phase 2.4-tuned final config (chosen on the 2022 backtest; validated on held-out 2018).
# Module defaults above are the *original* values; main() regenerates the tuned final model.
# Tuning preferred a longer memory and a stronger Elo prior (both hit the grid edge).
CHOSEN_HALF_LIFE = 1460.0
CHOSEN_LAMBDA_PRIOR = 20.0
CHOSEN_TIER_WEIGHTS = {1: 1.10, 2: 0.75, 3: 0.60, 4: 0.45, 5: 0.30}


@dataclass
class FitData:
    teams: list[str]
    home: np.ndarray
    away: np.ndarray
    x: np.ndarray
    y: np.ndarray
    w: np.ndarray
    hh: np.ndarray
    home_burden: np.ndarray
    away_burden: np.ndarray
    m_target: np.ndarray
    lambda_prior: float = LAMBDA_PRIOR


def load_altitude() -> dict[str, float]:
    df = pd.read_csv(ALTITUDE_CSV, encoding="utf-8")
    return dict(zip(df.team, df.home_altitude_m.astype(float)))


def prepare_data(df, elo, *, as_of: date, fit_max_date: str | None = None,
                 altitude: dict | None = None, tier_weights: dict | None = None,
                 half_life_days: float = HALF_LIFE_DAYS,
                 lambda_prior: float = LAMBDA_PRIOR) -> FitData:
    df = df[df["is_fifa"]].copy()
    if fit_max_date is not None:
        df = df[df["date"] < fit_max_date]
        assert (df["date"] < fit_max_date).all(), "LEAKAGE: row with date >= fit_max_date"
    df = df[df["date"] >= FIT_MIN_DATE].copy()
    if altitude is None:
        altitude = load_altitude()

    xi = math.log(2.0) / half_life_days
    age = (pd.Timestamp(as_of) - pd.to_datetime(df["date"])).dt.days.to_numpy()
    tour_w = (df["tournament_tier"].map(tier_weights).to_numpy() if tier_weights
              else df["tournament_weight"].to_numpy())
    w = tour_w * np.exp(-xi * age)
    keep = w > 1e-6
    df, w = df[keep], w[keep]

    teams = sorted(set(df["home_team_canon"]) | set(df["away_team_canon"]))
    idx = {t: i for i, t in enumerate(teams)}
    home = df["home_team_canon"].map(idx).to_numpy()
    away = df["away_team_canon"].map(idx).to_numpy()
    x = df["home_score"].to_numpy().astype(np.int64)
    y = df["away_score"].to_numpy().astype(np.int64)
    neutral = df["neutral"].to_numpy().astype(bool)
    hh = (~neutral).astype(float)

    h_alt = df["home_team_canon"].map(lambda t: altitude.get(t, 0.0)).to_numpy()
    a_alt = df["away_team_canon"].map(lambda t: altitude.get(t, 0.0)).to_numpy()
    venue_alt = np.where(neutral, 0.0, h_alt)
    home_burden = np.maximum(0.0, venue_alt - h_alt) / 1000.0
    away_burden = np.maximum(0.0, venue_alt - a_alt) / 1000.0

    er = dict(zip(elo["team"], elo["rating"]))
    r = np.array([er.get(t, np.nan) for t in teams], dtype=float)
    mean_r = np.nanmean(r)
    r = np.where(np.isnan(r), mean_r, r)
    z = (r - mean_r) / (r.std() + 1e-9)
    m_target = z * STRENGTH_SCALE

    return FitData(teams, home, away, x, y, w, hh, home_burden, away_burden, m_target,
                   lambda_prior=lambda_prior)


def _unpack(theta, n):
    a = theta[:n]; d = theta[n:2 * n]
    c, h, ac, rho = theta[2 * n], theta[2 * n + 1], theta[2 * n + 2], theta[2 * n + 3]
    return a, d, c, h, ac, rho


def neg_log_likelihood(theta, data: FitData):
    n = len(data.teams)
    a, d, c, h, ac, rho = _unpack(theta, n)
    home, away, x, y, w, hh = data.home, data.away, data.x, data.y, data.w, data.hh
    hb, ab = data.home_burden, data.away_burden

    log_lam = c + a[home] - d[away] + h * hh - ac * hb
    log_mu = c + a[away] - d[home] - ac * ab
    lam = np.exp(log_lam); mu = np.exp(log_mu)

    ll = x * log_lam - lam + y * log_mu - mu

    tau = np.ones_like(lam)
    dtau_dl = np.zeros_like(lam); dtau_dm = np.zeros_like(lam); dtau_dr = np.zeros_like(lam)
    m00 = (x == 0) & (y == 0); m01 = (x == 0) & (y == 1)
    m10 = (x == 1) & (y == 0); m11 = (x == 1) & (y == 1)
    tau[m00] = 1 - lam[m00] * mu[m00] * rho
    dtau_dl[m00] = -mu[m00] * rho; dtau_dm[m00] = -lam[m00] * rho; dtau_dr[m00] = -lam[m00] * mu[m00]
    tau[m01] = 1 + lam[m01] * rho; dtau_dl[m01] = rho; dtau_dr[m01] = lam[m01]
    tau[m10] = 1 + mu[m10] * rho; dtau_dm[m10] = rho; dtau_dr[m10] = mu[m10]
    tau[m11] = 1 - rho; dtau_dr[m11] = -1.0
    tau = np.maximum(tau, TAU_FLOOR)
    ll = ll + np.log(tau)

    net = a + d
    pen_elo = data.lambda_prior * np.sum((net - data.m_target) ** 2)
    pen_ridge = LAMBDA_RIDGE * np.sum(a * a + d * d)
    nll = -np.sum(w * ll) + pen_elo + pen_ridge

    # gradient
    inv = w / tau
    g_loglam = w * (x - lam) + inv * dtau_dl * lam
    g_logmu = w * (y - mu) + inv * dtau_dm * mu

    ga = np.zeros(n); gd = np.zeros(n)
    np.add.at(ga, home, g_loglam); np.add.at(ga, away, g_logmu)
    np.add.at(gd, away, -g_loglam); np.add.at(gd, home, -g_logmu)
    gc = np.sum(g_loglam + g_logmu)
    gh = np.sum(g_loglam * hh)
    gac = np.sum(g_loglam * (-hb) + g_logmu * (-ab))
    gr = np.sum(inv * dtau_dr)

    grad = np.empty_like(theta)
    grad[:n] = -ga + 2 * data.lambda_prior * (net - data.m_target) + 2 * LAMBDA_RIDGE * a
    grad[n:2 * n] = -gd + 2 * data.lambda_prior * (net - data.m_target) + 2 * LAMBDA_RIDGE * d
    grad[2 * n] = -gc
    grad[2 * n + 1] = -gh
    grad[2 * n + 2] = -gac
    grad[2 * n + 3] = -gr
    return nll, grad


def fit(df=None, elo=None, *, fit_max_date: str | None = None, use_altitude: bool = True,
        altitude: dict | None = None, tier_weights: dict | None = None,
        half_life_days: float = HALF_LIFE_DAYS, lambda_prior: float = LAMBDA_PRIOR) -> dict:
    if df is None:
        df = pd.read_csv(CLEAN, encoding="utf-8")
    if elo is None:
        elo = pd.read_csv(ELO, encoding="utf-8")
    as_of = date.fromisoformat(fit_max_date) if fit_max_date else CUTOFF
    data = prepare_data(df, elo, as_of=as_of, fit_max_date=fit_max_date, altitude=altitude,
                        tier_weights=tier_weights, half_life_days=half_life_days,
                        lambda_prior=lambda_prior)
    n = len(data.teams)

    theta0 = np.zeros(2 * n + 4)
    theta0[:n] = data.m_target / 2.0
    theta0[n:2 * n] = data.m_target / 2.0
    theta0[2 * n] = math.log(max(0.1, (data.x.mean() + data.y.mean()) / 2.0))
    theta0[2 * n + 1] = 0.3      # h
    theta0[2 * n + 2] = 0.1 if use_altitude else 0.0   # altitude_coef
    theta0[2 * n + 3] = -0.05    # rho

    ac_bounds = AC_BOUNDS if use_altitude else (0.0, 0.0)
    bounds = [(None, None)] * (2 * n) + [(None, None), H_BOUNDS, ac_bounds, RHO_BOUNDS]
    res = minimize(neg_log_likelihood, theta0, args=(data,), jac=True, method="L-BFGS-B",
                   bounds=bounds, options={"maxiter": 1000, "ftol": 1e-10, "gtol": 1e-7})

    a, d, c, h, ac, rho = _unpack(res.x, n)
    a = a - a.mean(); d = d - d.mean()

    return {
        "_meta": {
            "model": "Dixon-Coles bivariate-Poisson + host advantage + altitude penalty",
            "fit_on": f"historical_results_clean.csv (is_fifa, {FIT_MIN_DATE}<=date"
                      f"{'<' + fit_max_date if fit_max_date else ''})",
            "as_of": as_of.isoformat(),
            "captured_on": CUTOFF.isoformat(),
            "optimizer": f"L-BFGS-B success={res.success} iters={res.nit} nll={res.fun:.1f}",
        },
        "intercept_c": float(c),
        "home_advantage": float(h),
        "altitude_coef": float(ac),
        "rho": float(rho),
        "teams": {t: {"attack": float(a[i]), "defense": float(d[i])}
                  for i, t in enumerate(data.teams)},
        "hyperparameters": {
            "half_life_days": half_life_days, "xi_per_day": math.log(2.0) / half_life_days,
            "strength_scale": STRENGTH_SCALE, "lambda_prior": lambda_prior,
            "lambda_ridge": LAMBDA_RIDGE, "fit_min_date": FIT_MIN_DATE,
            "rho_bounds": list(RHO_BOUNDS), "h_bounds": list(H_BOUNDS),
            "altitude_coef_bounds": list(AC_BOUNDS), "use_altitude": use_altitude,
            "tier_weights": tier_weights, "n_teams": n, "n_matches": int(len(data.x)),
            "effective_matches_weighted": float(data.w.sum()),
        },
    }


# ---- prediction helpers ----
_INV_FACT = {}


def _inv_factorial(max_goals: int) -> np.ndarray:
    arr = _INV_FACT.get(max_goals)
    if arr is None:
        arr = 1.0 / np.array([math.factorial(k) for k in range(max_goals + 1)], dtype=float)
        _INV_FACT[max_goals] = arr
    return arr


def score_matrix(lam, mu, rho, max_goals=10):
    i = np.arange(max_goals + 1)
    inv_fact = _inv_factorial(max_goals)
    pa = np.exp(-lam) * lam ** i * inv_fact
    pb = np.exp(-mu) * mu ** i * inv_fact
    mat = np.outer(pa, pb)
    mat[0, 0] *= 1 - lam * mu * rho
    mat[0, 1] *= 1 + lam * rho
    mat[1, 0] *= 1 + mu * rho
    mat[1, 1] *= 1 - rho
    mat = np.maximum(mat, 0.0)
    return mat / mat.sum()


def main() -> None:
    params = fit(half_life_days=CHOSEN_HALF_LIFE, lambda_prior=CHOSEN_LAMBDA_PRIOR,
                 tier_weights=CHOSEN_TIER_WEIGHTS)
    OUT.write_text(json.dumps(params, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"  {params['_meta']['optimizer']}")
    print(f"  c={params['intercept_c']:.3f}  h={params['home_advantage']:.3f}  "
          f"altitude_coef={params['altitude_coef']:.4f}  rho={params['rho']:.4f}")
    print(f"  host-advantage sanity h={params['home_advantage']:.3f} "
          f"({'OK' if 0.20 <= params['home_advantage'] <= 0.50 else 'CHECK'})")
    rank = sorted(params["teams"].items(), key=lambda kv: -(kv[1]["attack"] + kv[1]["defense"]))
    print("  top-10 by net strength:")
    for t, v in rank[:10]:
        print(f"    {v['attack']+v['defense']:+.3f}  {t}")


if __name__ == "__main__":
    main()

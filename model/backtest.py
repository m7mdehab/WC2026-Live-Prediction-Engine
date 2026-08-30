"""Phase 2.4 -- match-level backtest harness, Elo-only baseline, tuning, calibration.

For a target WC: refit Elo then Dixon-Coles strictly on data before the opener
(leakage-guarded), predict W/D/L for every WC match from the tau-corrected score matrix,
and score with model/metrics.py. The full pipeline (defaults vs tuned, baseline vs full,
2022 tuning, 2018 hold-out, calibration, final 2026 refit, acceptance check) is in main().
"""
from __future__ import annotations

import json
import math
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from model import dixon_coles as dc
from model import metrics as M
from model.elo import ALTITUDE_ELO_COEF, compute_elo, load_altitude

ROOT = Path(__file__).resolve().parents[1]
CLEAN = ROOT / "data" / "historical_results_clean.csv"
BT_DIR = ROOT / "data" / "backtest"
BT_PARAMS = ROOT / "model" / "backtest"

WC_OPENERS = {"2018": "2018-06-14", "2022": "2022-11-20"}
WC_HOSTS = {"2018": "Russia", "2022": "Qatar"}
DEFAULT_TIER_WEIGHTS = {1: 1.0, 2: 0.85, 3: 0.70, 4: 0.55, 5: 0.20}
H_WC_DISCOUNT = 0.7   # chosen in the Phase 2 refinement (fixed, not tuned here)


# ----------------------------------------------------------------- prediction
def predict_wdl(params, home, away, neutral, altitude, h_disc=H_WC_DISCOUNT):
    att = params["_att"]; dfn = params["_dfn"]
    c, h, ac, rho = params["intercept_c"], params["home_advantage"], \
        params.get("altitude_coef", 0.0), params["rho"]
    hh = 0.0 if neutral else 1.0
    venue_alt = altitude.get(home, 0.0) if not neutral else 0.0
    bh = max(0.0, venue_alt - altitude.get(home, 0.0)) / 1000.0
    ba = max(0.0, venue_alt - altitude.get(away, 0.0)) / 1000.0
    lam = math.exp(c + att.get(home, 0.0) - dfn.get(away, 0.0) + h * h_disc * hh - ac * bh)
    mu = math.exp(c + att.get(away, 0.0) - dfn.get(home, 0.0) - ac * ba)
    mat = dc.score_matrix(lam, mu, rho, 10)
    return np.tril(mat, -1).sum(), np.trace(mat), np.triu(mat, 1).sum()


def _attach_lookups(params):
    params["_att"] = {t: v["attack"] for t, v in params["teams"].items()}
    params["_dfn"] = {t: v["defense"] for t, v in params["teams"].items()}
    return params


def wc_matches(df, year):
    wc = df[(df.competition_category == "wc_finals") & (df.date.str[:4] == year)].copy()
    return wc.sort_values("date")


def predict_matches(params, matches, altitude, h_disc=H_WC_DISCOUNT):
    P, Y = [], []
    for r in matches.itertuples(index=False):
        P.append(predict_wdl(params, r.home_team_canon, r.away_team_canon,
                             bool(r.neutral), altitude, h_disc))
        Y.append(M.outcome(int(r.home_score), int(r.away_score)))
    return np.array(P), np.array(Y)


# ----------------------------------------------------------------- fitting
def fit_pre(df, altitude, fit_max_date, *, half_life, lambda_prior, tier_weights):
    relo, _ = compute_elo(df, fit_max_date=fit_max_date, altitude_coef=ALTITUDE_ELO_COEF,
                          altitude=altitude, tier_weights=tier_weights)
    params = dc.fit(df, elo=relo, fit_max_date=fit_max_date, use_altitude=True,
                    altitude=altitude, tier_weights=tier_weights,
                    half_life_days=half_life, lambda_prior=lambda_prior)
    return _attach_lookups(params), relo


def backtest_year(df, altitude, year, *, half_life, lambda_prior, tier_weights, save=False):
    opener = WC_OPENERS[year]
    params, _ = fit_pre(df, altitude, opener, half_life=half_life,
                        lambda_prior=lambda_prior, tier_weights=tier_weights)
    matches = wc_matches(df, year)
    P, Y = predict_matches(params, matches, altitude)
    metrics = M.all_metrics(P, Y)
    if save:
        BT_DIR.mkdir(parents=True, exist_ok=True)
        BT_PARAMS.mkdir(parents=True, exist_ok=True)
        out = matches[["date", "home_team_canon", "away_team_canon", "home_score",
                       "away_score", "neutral"]].copy()
        out["p_home_win"], out["p_draw"], out["p_away_win"] = P[:, 0], P[:, 1], P[:, 2]
        out["outcome"] = Y
        out.to_csv(BT_DIR / f"wc{year}_predictions.csv", index=False, encoding="utf-8")
        save_params = {k: v for k, v in params.items() if not k.startswith("_")}
        (BT_PARAMS / f"dc_pre_{year}.json").write_text(
            json.dumps(save_params, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"P": P, "Y": Y, "matches": matches, "params": params, "metrics": metrics}


# ----------------------------------------------------------------- Elo-only baseline
def elo_baseline(df, altitude, year, *, half_life, lambda_prior, tier_weights):
    from sklearn.linear_model import LogisticRegression
    opener = WC_OPENERS[year]; host = WC_HOSTS[year]
    ratings, _, feats = compute_elo(df, fit_max_date=opener, altitude_coef=ALTITUDE_ELO_COEF,
                                    altitude=altitude, tier_weights=tier_weights,
                                    return_features=True)
    feats = feats[feats.date >= f"{int(year)-8}-01-01"]
    # training features: elo_diff, neutral, a_home (=home in own country), b_home (always 0 here)
    Xtr = np.column_stack([
        feats.elo_home_pre - feats.elo_away_pre,
        feats.neutral.astype(float),
        (~feats.neutral.astype(bool)).astype(float),   # a_home
        np.zeros(len(feats)),                          # b_home
    ])
    ytr = feats.outcome.to_numpy()
    clf = LogisticRegression(max_iter=2000, C=1.0)
    clf.fit(Xtr, ytr)

    er = dict(zip(ratings.team, ratings.rating))
    matches = wc_matches(df, year)
    rows, Y = [], []
    for r in matches.itertuples(index=False):
        a, b = r.home_team_canon, r.away_team_canon
        a_home = 1.0 if a == host else 0.0
        b_home = 1.0 if b == host else 0.0
        neutral = 0.0 if (a_home or b_home) else 1.0
        rows.append([er.get(a, 1500) - er.get(b, 1500), neutral, a_home, b_home])
        Y.append(M.outcome(int(r.home_score), int(r.away_score)))
    P = clf.predict_proba(np.array(rows))
    # align columns to [0,1,2]
    cols = {c: i for i, c in enumerate(clf.classes_)}
    P = P[:, [cols[0], cols[1], cols[2]]]
    return P, np.array(Y), M.all_metrics(P, np.array(Y))


# ----------------------------------------------------------------- tuning (2022 only)
TIER_GRID_STEPS = [-0.10, -0.05, 0.0, 0.05, 0.10]
HALF_LIFE_GRID = [365, 547, 730, 1095, 1460]
LAMBDA_GRID = [2.5, 5.0, 10.0, 20.0]


class _Tuner:
    """Coordinate descent on 2022. Loss = 0.5*brier/brier0 + 0.5*logloss/ll0."""
    def __init__(self, df, altitude):
        self.df = df; self.alt = altitude
        self.matches = wc_matches(df, "2022")
        self._elo_cache = {}

    def _elo(self, tiers):
        key = tuple(sorted(tiers.items()))
        if key not in self._elo_cache:
            r, _ = compute_elo(self.df, fit_max_date=WC_OPENERS["2022"],
                               altitude_coef=ALTITUDE_ELO_COEF, altitude=self.alt,
                               tier_weights=tiers)
            self._elo_cache[key] = r
        return self._elo_cache[key]

    def metrics(self, half_life, lambda_prior, tiers):
        relo = self._elo(tiers)
        params = dc.fit(self.df, elo=relo, fit_max_date=WC_OPENERS["2022"], use_altitude=True,
                        altitude=self.alt, tier_weights=tiers, half_life_days=half_life,
                        lambda_prior=lambda_prior)
        _attach_lookups(params)
        P, Y = predict_matches(params, self.matches, self.alt)
        return M.all_metrics(P, Y)

    def run(self):
        cfg = {"half_life": 730.0, "lambda_prior": 5.0,
               "tiers": dict(DEFAULT_TIER_WEIGHTS)}
        m0 = self.metrics(**cfg)
        b0, l0 = m0["brier"], m0["log_loss"]

        def loss(m):
            return 0.5 * m["brier"] / b0 + 0.5 * m["log_loss"] / l0

        best = loss(m0)
        history = [("default", cfg_copy(cfg), best, m0["brier"], m0["log_loss"])]
        moved, passes = True, 0
        while moved and passes < 3:
            moved = False; passes += 1
            # half_life
            cands = []
            for v in HALF_LIFE_GRID:
                c = cfg_copy(cfg); c["half_life"] = float(v)
                m = self.metrics(**c); cands.append((loss(m), v, m))
            cands.sort(key=lambda t: (t[0], abs(t[1] - 730)))
            if cands[0][0] < best - 1e-9 and cands[0][1] != cfg["half_life"]:
                cfg["half_life"] = float(cands[0][1]); best = cands[0][0]; moved = True
                history.append((f"half_life={cfg['half_life']}", cfg_copy(cfg), best,
                                cands[0][2]["brier"], cands[0][2]["log_loss"]))
            # lambda_prior
            cands = []
            for v in LAMBDA_GRID:
                c = cfg_copy(cfg); c["lambda_prior"] = v
                m = self.metrics(**c); cands.append((loss(m), v, m))
            cands.sort(key=lambda t: (t[0], abs(t[1] - 5.0)))
            if cands[0][0] < best - 1e-9 and cands[0][1] != cfg["lambda_prior"]:
                cfg["lambda_prior"] = cands[0][1]; best = cands[0][0]; moved = True
                history.append((f"lambda_prior={cfg['lambda_prior']}", cfg_copy(cfg), best,
                                cands[0][2]["brier"], cands[0][2]["log_loss"]))
            # each tier
            for tier in (1, 2, 3, 4, 5):
                d = DEFAULT_TIER_WEIGHTS[tier]
                cands = []
                for step in TIER_GRID_STEPS:
                    v = round(d + step, 4)
                    if v <= 0:
                        continue
                    c = cfg_copy(cfg); c["tiers"][tier] = v
                    m = self.metrics(**c); cands.append((loss(m), v, m))
                cands.sort(key=lambda t: (t[0], abs(t[1] - d)))
                if cands[0][0] < best - 1e-9 and cands[0][1] != cfg["tiers"][tier]:
                    cfg["tiers"][tier] = cands[0][1]; best = cands[0][0]; moved = True
                    history.append((f"tier{tier}={cfg['tiers'][tier]}", cfg_copy(cfg), best,
                                    cands[0][2]["brier"], cands[0][2]["log_loss"]))
        return cfg, best, history, (b0, l0)


def cfg_copy(cfg):
    return {"half_life": cfg["half_life"], "lambda_prior": cfg["lambda_prior"],
            "tiers": dict(cfg["tiers"])}


# ----------------------------------------------------------------- calibration (§6)
def _logit(p, eps=1e-6):
    p = np.clip(p, eps, 1 - eps)
    return np.log(p / (1 - p))


def fit_calibrator(Pw, Yw, method):
    """Per-class one-vs-rest calibrator. 'platt' = logistic on logit; 'isotonic'."""
    from sklearn.isotonic import IsotonicRegression
    from sklearn.linear_model import LogisticRegression
    models = []
    for c in range(3):
        target = (Yw == c).astype(int)
        if method == "platt":
            lr = LogisticRegression(C=1e6, solver="lbfgs")
            lr.fit(_logit(Pw[:, c]).reshape(-1, 1), target)
            models.append(("platt", float(lr.coef_[0, 0]), float(lr.intercept_[0])))
        elif method == "isotonic":
            iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
            iso.fit(Pw[:, c], target)
            models.append(("isotonic", iso))
        else:
            raise ValueError(method)
    return models


def apply_calibrator(models, P):
    cols = []
    for c in range(3):
        m = models[c]
        if m[0] == "platt":
            z = m[1] * _logit(P[:, c]) + m[2]
            cols.append(1.0 / (1.0 + np.exp(-z)))
        else:
            cols.append(m[1].predict(P[:, c]))
    Pc = np.clip(np.column_stack(cols), 1e-9, None)
    return Pc / Pc.sum(axis=1, keepdims=True)


def calibration_window_eval(df, altitude, year, cfg, method):
    """Fit DC before the calibration window, fit a calibrator on the window, apply to that
    year's WC predictions (from the standard pre-WC fit). Returns (raw_metrics, cal_metrics)."""
    opener = WC_OPENERS[year]
    cal_cutoff = f"{int(year) - 1}-06-01"
    cal_params, _ = fit_pre(df, altitude, cal_cutoff, **cfg)
    win = df[(df.is_fifa) & (df.date >= cal_cutoff) & (df.date < opener)]
    Pw, Yw = predict_matches(cal_params, win, altitude)
    models = fit_calibrator(Pw, Yw, method)
    r = backtest_year(df, altitude, year, **cfg)
    P, Y = r["P"], r["Y"]
    Pc = apply_calibrator(models, P)
    return M.all_metrics(P, Y), M.all_metrics(Pc, Y)


def assert_pre_cutoff(dates, cutoff):
    """Leakage guard: raise if any date is on/after the cutoff. Used as a tripwire by the
    fits (which also truncate) and directly unit-tested."""
    if (pd.Series(list(dates)) >= cutoff).any():
        raise AssertionError(f"leakage: row(s) with date >= {cutoff}")

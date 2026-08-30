"""Phase 2 refinement, Steps 1b/6/7 -- host-realism backtest + config comparison.

For each of 2010 SA, 2014 BRA, 2018 RUS, 2022 QAT: refit Elo then Dixon-Coles strictly on
data BEFORE the opener (fit_max_date), then run a 5,000-iter Monte Carlo of the host's
actual group using the corrected FIFA Article 13 tie-breakers (tiebreakers.rank_group) and
report the host's predicted advance% vs the actual outcome.

Then sweep refinement configs and tabulate: Mexico/USA 2026 advance%, Ecuador/Bolivia Elo
rank, and the host-backtest mean absolute error (predicted host advance% vs actual {1,0}).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from model import dixon_coles as dc
from model.elo import compute_elo, load_altitude
from simulator.engine import monte_carlo
from simulator.model_sampler import DixonColesSampler
from simulator.tiebreakers import rank_group

ROOT = Path(__file__).resolve().parents[1]
CLEAN = ROOT / "data" / "historical_results_clean.csv"

# host, opener date, host home altitude, actual: advanced(1)/eliminated(0), label
HOSTS = [
    ("South Africa", "2010-06-11", 1700.0, 0, "eliminated (group stage)"),
    ("Brazil",       "2014-06-12",   10.0, 1, "advanced (made SF)"),
    ("Russia",       "2018-06-14",    0.0, 1, "advanced (made QF)"),
    ("Qatar",        "2022-11-20",    0.0, 0, "eliminated (group stage)"),
]


@dataclass
class Config:
    name: str
    gd_mult: str = "ln"
    home_adv: float = 65.0
    alt_elo: float = 0.0
    dc_altitude: bool = False
    h_disc: float = 1.0
    elo_key: tuple = field(default=())

    def __post_init__(self):
        self.elo_key = (self.gd_mult, self.home_adv, self.alt_elo, self.dc_altitude)


def _load_fifa():
    df = pd.read_csv(ROOT / "data" / "fifa_rankings_history.csv", encoding="utf-8")
    eds = {}
    for ed, g in df.groupby("edition_date"):
        eds[ed] = dict(zip(g.team, g["rank"].astype(int)))
    dates = sorted(eds, reverse=True)
    return eds[dates[0]], [eds[d] for d in dates[1:]]


def derive_host_group(df, host, year):
    wc = df[(df.competition_category == "wc_finals") & (df.date.str[:4] == str(year))]
    hm = wc[(wc.home_team_canon == host) | (wc.away_team_canon == host)].sort_values("date")
    opps = []
    for _, r in hm.iterrows():
        opp = r.away_team_canon if r.home_team_canon == host else r.home_team_canon
        if opp not in opps:
            opps.append(opp)
        if len(opps) == 3:
            break
    return [host] + opps


def _lam_mu(att, dfn, c, h, ac, a, b, a_home, b_home, venue_alt, team_alt, h_disc):
    ha = h * h_disc if a_home else 0.0
    hb = h * h_disc if b_home else 0.0
    ba = max(0.0, venue_alt - team_alt.get(a, 0.0)) / 1000.0
    bb = max(0.0, venue_alt - team_alt.get(b, 0.0)) / 1000.0
    return (math.exp(c + att.get(a, 0.0) - dfn.get(b, 0.0) + ha - ac * ba),
            math.exp(c + att.get(b, 0.0) - dfn.get(a, 0.0) + hb - ac * bb))


def host_advance_prob(teams, params, host, host_alt, h_disc, fifa_latest, fifa_prev,
                      team_alt, iters=5000, seed=20260603):
    att = {t: v["attack"] for t, v in params["teams"].items()}
    dfn = {t: v["defense"] for t, v in params["teams"].items()}
    c, h, ac, rho = (params["intercept_c"], params["home_advantage"],
                     params.get("altitude_coef", 0.0), params["rho"])
    rng = np.random.default_rng(seed)
    pairs = [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]
    advanced = 0
    for _ in range(iters):
        results = []
        for i, j in pairs:
            a, b = teams[i], teams[j]
            host_match = host in (a, b)
            venue_alt = host_alt if host_match else 0.0
            lam, mu = _lam_mu(att, dfn, c, h, ac, a, b, a == host, b == host,
                              venue_alt, team_alt, h_disc)
            flat = dc.score_matrix(lam, mu, rho, 10).ravel()
            k = int(np.searchsorted(np.cumsum(flat), rng.random() * flat.sum()))
            sa, sb = divmod(k, 11)
            results.append((a, b, sa, sb))
        order = rank_group(teams, results, fifa_latest, fifa_prev)
        if host in order[:2]:
            advanced += 1
    return advanced / iters


def evaluate(configs, df, alt_dict, fifa_latest, fifa_prev, mc_iters=4000):
    elo_cache, dc_cache, elo2026_cache = {}, {}, {}
    rows = []
    for cfg in configs:
        key = cfg.elo_key
        # 2026 Elo (for ranks) + DC params
        if key not in elo2026_cache:
            r2026, _ = compute_elo(df, home_adv_elo=cfg.home_adv, gd_mult_kind=cfg.gd_mult,
                                   altitude_coef=cfg.alt_elo, altitude=alt_dict)
            elo2026_cache[key] = r2026
            dc_cache[(key, "2026")] = dc.fit(df, elo=r2026, use_altitude=cfg.dc_altitude,
                                             altitude=alt_dict)
        r2026 = elo2026_cache[key]
        rank = {t: i + 1 for i, t in enumerate(r2026.team)}

        # 2026 Mexico/USA advance%
        sampler = DixonColesSampler(dc_cache[(key, "2026")], h_wc_discount=cfg.h_disc)
        probs, _, _ = monte_carlo(__import_loaders(), sampler, mc_iters, 42)
        mex = probs["Mexico"]["advance_group"]; usa = probs["United States"]["advance_group"]

        # host backtest
        errs = []
        for host, opener, host_alt, actual, _label in HOSTS:
            ck = (key, opener)
            if ck not in dc_cache:
                relo, _ = compute_elo(df, fit_max_date=opener, home_adv_elo=cfg.home_adv,
                                      gd_mult_kind=cfg.gd_mult, altitude_coef=cfg.alt_elo,
                                      altitude=alt_dict)
                dc_cache[ck] = dc.fit(df, elo=relo, fit_max_date=opener,
                                      use_altitude=cfg.dc_altitude, altitude=alt_dict)
            group = derive_host_group(df, host, opener[:4])
            p = host_advance_prob(group, dc_cache[ck], host, host_alt, cfg.h_disc,
                                  fifa_latest, fifa_prev, alt_dict)
            errs.append(abs(p - actual))
            rows_host = (cfg.name, host, p, actual)
            rows.append(("__host__", *rows_host))
        mae = float(np.mean(errs))
        rows.append(("__cfg__", cfg.name, mex, usa, rank.get("Ecuador"),
                     rank.get("Bolivia"), mae,
                     list(r2026.team[:6])))
    return rows


_LOADERS = None


def __import_loaders():
    global _LOADERS
    if _LOADERS is None:
        from simulator.loaders import load
        _LOADERS = load()
    return _LOADERS


def main():
    df = pd.read_csv(CLEAN, encoding="utf-8")
    alt_dict = load_altitude()
    fifa_latest, fifa_prev = _load_fifa()

    configs = [
        Config("baseline (current)"),
        Config("altitude only", alt_elo=50, dc_altitude=True),
        Config("altitude + h_disc=0.7", alt_elo=50, dc_altitude=True, h_disc=0.7),
        Config("altitude + h_disc=0.5", alt_elo=50, dc_altitude=True, h_disc=0.5),
        Config("altitude + gd=sqrt", alt_elo=50, dc_altitude=True, gd_mult="sqrt"),
        Config("altitude + home_adv=50", alt_elo=50, dc_altitude=True, home_adv=50),
        Config("altitude + gd=sqrt + h_disc=0.7", alt_elo=50, dc_altitude=True,
               gd_mult="sqrt", h_disc=0.7),
    ]
    rows = evaluate(configs, df, alt_dict, fifa_latest, fifa_prev)

    host_rows = [r for r in rows if r[0] == "__host__"]
    cfg_rows = [r for r in rows if r[0] == "__cfg__"]

    print("\n=== Host-realism backtest (per config) ===")
    for _, cfgname, host, p, actual in host_rows:
        if cfgname == "baseline (current)":
            print(f"  {host:14s} predicted {p*100:5.1f}%   actual={'advanced' if actual else 'eliminated'}")

    print("\n=== Comparison table ===")
    hdr = f"{'config':36s} {'MEX adv':>8s} {'USA adv':>8s} {'ECU rk':>7s} {'BOL rk':>7s} {'host MAE':>9s}"
    print(hdr); print("-" * len(hdr))
    for _, name, mex, usa, ecu, bol, mae, top6 in cfg_rows:
        print(f"{name:36s} {mex*100:7.1f}% {usa*100:7.1f}% {str(ecu):>7s} {str(bol):>7s} {mae:9.3f}")
    print("\ntop-6 Elo by config:")
    for _, name, *_rest, top6 in cfg_rows:
        print(f"  {name:36s} {top6}")

    # also write a machine-readable summary
    import json
    out = ROOT / "data" / "runs" / "host_backtest_summary.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "hosts": [{"config": c, "host": h, "predicted": p, "actual": a}
                  for _, c, h, p, a in host_rows],
        "configs": [{"name": n, "mexico_adv": mx, "usa_adv": u, "ecuador_rank": e,
                     "bolivia_rank": b, "host_mae": mae, "elo_top6": t6}
                    for _, n, mx, u, e, b, mae, t6 in cfg_rows],
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nwrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

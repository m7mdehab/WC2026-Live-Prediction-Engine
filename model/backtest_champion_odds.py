"""Pre-tournament CHAMPION ODDS for WC2018 and WC2022 (offline backtest).

The match-model backtest scores per-match W/D/L but never simulates the bracket, so it has no champion
prediction. This builds each year's 32-team / 8-group / top-2 / R16 bracket, fits the model's team
strengths STRICTLY before the opener (the same Elo + Dixon-Coles + tuned config the backtest uses), and
Monte-Carlos the bracket to produce champion odds -- the "did the model pick the winner" answer.

REUSE / why a 32-team resolver: the production simulator.engine.monte_carlo / simulate_once is hardwired
to the 2026 48-team / 12-group format (best-eight thirds, Annex C combo_lookup, R32 with M073..M104
wiring) and CANNOT represent a 32-team / 8-group / top-2 / R16 bracket. So this module provides a
format-correct single-tournament resolver, but REUSES every reusable piece: model.backtest.fit_pre (the
exact pre-opener Elo+DC fit + its fit_max_date leakage guard), model.backtest_retro.chosen_config (the
tuned hyperparameters), simulator.tiebreakers (FIFA Article 13 group ranking), model.dixon_coles.
score_matrix (the scoreline distribution), and the monte_carlo champion-odds contract (STAGES + per-team
probabilities). It writes ONLY data/backtest/ JSON; no Supabase, no DB, no production-artifact mutation.

Run from repo root:  python -m model.backtest_champion_odds
"""
from __future__ import annotations

import json
import math
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

from model.backtest import H_WC_DISCOUNT, WC_HOSTS, WC_OPENERS, fit_pre
from model.backtest_retro import chosen_config
from model.dixon_coles import score_matrix
from model.elo import load_altitude
from simulator import tiebreakers as tb

ROOT = Path(__file__).resolve().parents[1]
CLEAN = ROOT / "data" / "historical_results_clean.csv"
FIFA = ROOT / "data" / "fifa_rankings_history.csv"
BT_DIR = ROOT / "data" / "backtest"
MAX_GOALS = 10
SEED = 42
ITERS = 50_000

# ---- official group draws (canonical names matching historical_results_clean.csv) ----------------
# Hardcoded from the published 2018/2022 draws; validated against the predictions CSV team set + the
# real R16/QF pairings in tests. [FLAGGED sub-decision: the draw is fixed/known in advance.]
GROUPS = {
    "2018": {
        "A": ["Russia", "Saudi Arabia", "Egypt", "Uruguay"],
        "B": ["Portugal", "Spain", "Morocco", "Iran"],
        "C": ["France", "Australia", "Peru", "Denmark"],
        "D": ["Argentina", "Iceland", "Croatia", "Nigeria"],
        "E": ["Brazil", "Switzerland", "Costa Rica", "Serbia"],
        "F": ["Germany", "Mexico", "Sweden", "South Korea"],
        "G": ["Belgium", "Panama", "Tunisia", "England"],
        "H": ["Poland", "Senegal", "Colombia", "Japan"],
    },
    "2022": {
        "A": ["Qatar", "Ecuador", "Senegal", "Netherlands"],
        "B": ["England", "Iran", "United States", "Wales"],
        "C": ["Argentina", "Saudi Arabia", "Mexico", "Poland"],
        "D": ["France", "Australia", "Denmark", "Tunisia"],
        "E": ["Spain", "Costa Rica", "Germany", "Japan"],
        "F": ["Belgium", "Canada", "Morocco", "Croatia"],
        "G": ["Brazil", "Serbia", "Switzerland", "Cameroon"],
        "H": ["Portugal", "Ghana", "Uruguay", "South Korea"],
    },
}

# ---- standard FIFA 32-team knockout bracket (shared by 2018 & 2022) -------------------------------
# slots: "1X"/"2X" = group X winner/runner; "W:id"/"L:id" = winner/loser of a prior KO match.
# Validated by 2018's real bracket: R16 1A-2B=Uruguay-Portugal, 1C-2D=France-Argentina, ...; QF
# W:r1-W:r2 = France-Uruguay; final W:s1-W:s2 = France-Croatia. (Same template in 2022.)
BRACKET = [
    ("r1", "round_of_16", "1A", "2B"), ("r2", "round_of_16", "1C", "2D"),
    ("r3", "round_of_16", "1E", "2F"), ("r4", "round_of_16", "1G", "2H"),
    ("r5", "round_of_16", "1B", "2A"), ("r6", "round_of_16", "1D", "2C"),
    ("r7", "round_of_16", "1F", "2E"), ("r8", "round_of_16", "1H", "2G"),
    ("q1", "quarter_final", "W:r1", "W:r2"), ("q2", "quarter_final", "W:r3", "W:r4"),
    ("q3", "quarter_final", "W:r5", "W:r6"), ("q4", "quarter_final", "W:r7", "W:r8"),
    ("s1", "semi_final", "W:q1", "W:q2"), ("s2", "semi_final", "W:q3", "W:q4"),
    ("t", "third_place", "L:s1", "L:s2"),
    ("f", "final", "W:s1", "W:s2"),
]
R16_IDS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"]
QF_IDS = ["q1", "q2", "q3", "q4"]
SF_IDS = ["s1", "s2"]


class BacktestSampler:
    """Scoreline sampler from a pre-opener Dixon-Coles fit. Mirrors simulator.model_sampler.
    DixonColesSampler's lambda/mu + score-matrix sampling (reusing model.dixon_coles.score_matrix),
    built from `params` (fit_pre output). Host advantage is applied to the host nation in every match
    (it plays at home throughout), scaled by H_WC_DISCOUNT, matching predict_wdl's host term. The 2026
    venue/altitude file coupling is omitted (it does not apply to 2018/2022). [FLAGGED]"""

    def __init__(self, params: dict, host: str | None = None, h_wc_discount: float = H_WC_DISCOUNT):
        self.c = params["intercept_c"]
        self.h = params["home_advantage"]
        self.rho = params["rho"]
        self.att = {t: v["attack"] for t, v in params["teams"].items()}
        self.dfn = {t: v["defense"] for t, v in params["teams"].items()}
        self.host = host
        self.hwc = h_wc_discount

    def _host_term(self, team: str) -> float:
        return self.h * self.hwc if (self.host is not None and team == self.host) else 0.0

    def _lam_mu(self, a: str, b: str):
        log_lam = self.c + self.att.get(a, 0.0) - self.dfn.get(b, 0.0) + self._host_term(a)
        log_mu = self.c + self.att.get(b, 0.0) - self.dfn.get(a, 0.0) + self._host_term(b)
        return math.exp(log_lam), math.exp(log_mu)

    def group_score(self, a: str, b: str, rng):
        lam, mu = self._lam_mu(a, b)
        flat = score_matrix(lam, mu, self.rho, MAX_GOALS).ravel()
        k = int(np.searchsorted(np.cumsum(flat), rng.random() * flat.sum()))
        return divmod(k, MAX_GOALS + 1)

    def knockout_winner(self, a: str, b: str, rng):
        lam, mu = self._lam_mu(a, b)
        mat = score_matrix(lam, mu, self.rho, MAX_GOALS)
        wa = float(np.tril(mat, -1).sum() + np.trace(mat) / 2.0)  # P(win) + P(draw)/2
        return (a, b) if rng.random() < wa else (b, a)


def _load_fifa_pre(opener: str):
    """FIFA editions strictly before the opener (tiebreaker only): latest + previous, leakage-clean."""
    editions: dict[str, dict[str, int]] = {}
    with open(FIFA, encoding="utf-8") as f:
        import csv
        for row in csv.DictReader(f):
            if row["edition_date"] < opener:
                editions.setdefault(row["edition_date"], {})[row["team"]] = int(row["rank"])
    dates = sorted(editions, reverse=True)
    if not dates:
        return {}, []
    return editions[dates[0]], [editions[d] for d in dates[1:]]


def build_structure(year: str) -> dict:
    groups = GROUPS[year]
    all_teams = [t for g in groups.values() for t in g]
    assert len(all_teams) == 32 and len(set(all_teams)) == 32, f"{year}: expected 32 distinct teams"
    assert len(groups) == 8 and all(len(v) == 4 for v in groups.values()), f"{year}: 8 groups of 4"
    fifa_latest, fifa_prev = _load_fifa_pre(WC_OPENERS[year])
    return {"year": year, "groups": groups, "all_teams": all_teams,
            "fifa_latest": fifa_latest, "fifa_prev": fifa_prev}


def simulate_once_32(struct: dict, sampler: BacktestSampler, rng) -> dict:
    groups = struct["groups"]
    results = {g: [] for g in groups}
    for g, teams in groups.items():
        for i in range(4):
            for j in range(i + 1, 4):
                a, b = teams[i], teams[j]
                sa, sb = sampler.group_score(a, b, rng)
                results[g].append((a, b, sa, sb))
    winner, runner = {}, {}
    for g, teams in groups.items():
        ov = tb.overall_stats(teams, results[g])
        ranked = tb.rank_group(teams, results[g], struct["fifa_latest"], struct["fifa_prev"], overall=ov)
        winner[g], runner[g] = ranked[0], ranked[1]

    win, lose = {}, {}

    def resolve(slot: str) -> str:
        kind = slot[0]
        if kind == "1":
            return winner[slot[1]]
        if kind == "2":
            return runner[slot[1]]
        ref = slot[2:]                      # "W:r1" / "L:s1"
        return win[ref] if kind == "W" else lose[ref]

    for mid, _stage, sa_slot, sb_slot in BRACKET:
        a, b = resolve(sa_slot), resolve(sb_slot)
        w, l = sampler.knockout_winner(a, b, rng)
        win[mid], lose[mid] = w, l

    return {
        "champion": win["f"],
        "finalists": [win["s1"], win["s2"]],
        "reached_sf": [win[q] for q in QF_IDS],      # QF winners = semifinalists
        "reached_qf": [win[r] for r in R16_IDS],     # R16 winners = quarterfinalists
        "advanced": [winner[g] for g in groups] + [runner[g] for g in groups],
    }


def champion_odds(struct: dict, sampler: BacktestSampler, iters: int = ITERS, seed: int = SEED):
    rng = np.random.default_rng(seed)
    teams = struct["all_teams"]
    counts = {s: Counter() for s in ("advance", "reach_qf", "reach_sf", "reach_final", "champion")}
    for _ in range(iters):
        r = simulate_once_32(struct, sampler, rng)
        counts["champion"][r["champion"]] += 1
        for t in r["finalists"]:
            counts["reach_final"][t] += 1
        for t in r["reached_sf"]:
            counts["reach_sf"][t] += 1
        for t in r["reached_qf"]:
            counts["reach_qf"][t] += 1
        for t in r["advanced"]:
            counts["advance"][t] += 1
    return {t: {s: counts[s][t] / iters for s in counts} for t in teams}


def _ranked(probs: dict) -> list[tuple[str, float]]:
    return sorted(((t, p["champion"]) for t, p in probs.items()), key=lambda kv: (-kv[1], kv[0]))


def run_year(year: str, df, altitude, cfg, iters: int = ITERS, seed: int = SEED) -> dict:
    opener = WC_OPENERS[year]
    host = WC_HOSTS[year]
    params, _ = fit_pre(df, altitude, opener, half_life=cfg["half_life"],
                        lambda_prior=cfg["lambda_prior"], tier_weights=cfg["tiers"])
    struct = build_structure(year)
    sampler = BacktestSampler(params, host=host)
    probs = champion_odds(struct, sampler, iters=iters, seed=seed)

    ranking = _ranked(probs)
    rank_of = {t: i + 1 for i, (t, _) in enumerate(ranking)}
    WINNERS = {"2018": "France", "2022": "Argentina"}
    FINALISTS = {"2018": ["France", "Croatia"], "2022": ["Argentina", "France"]}
    winner = WINNERS[year]
    top10 = [{"rank": i + 1, "team": t, "champion_pct": round(100 * p, 2)}
             for i, (t, p) in enumerate(ranking[:10])]
    # FULL pre-tournament ranking (all 32 teams, rank + champion_pct) so every rank claim on the
    # methodology page is artifact-backed, not just the top 10 (e.g. Croatia, the 2018 finalist, sits
    # outside the top 10). Purely additive: the first 10 entries equal top10_champion_odds.
    full_ranking = [{"rank": i + 1, "team": t, "champion_pct": round(100 * p, 2)}
                    for i, (t, p) in enumerate(ranking)]
    champ_sum = sum(p["champion"] for p in probs.values())
    top1_pct = round(100 * ranking[0][1], 2)

    def read() -> str:
        wr = rank_of[winner]
        bucket = ("the model's top-1 pick" if wr == 1 else "in the model's top-3" if wr <= 3
                  else "in the model's top-5" if wr <= 5 else f"ranked #{wr} (outside the top 5)")
        conc = ("highly concentrated" if top1_pct >= 25 else "moderately concentrated"
                if top1_pct >= 15 else "spread out")
        return (f"{winner} (the actual {year} champion) was {bucket} at "
                f"{round(100*probs[winner]['champion'],2)}% champion odds; the field was {conc} "
                f"(top pick {ranking[0][0]} {top1_pct}%).")

    return {
        "year": year, "opener": opener, "fit_max_date": opener, "host": host,
        "seed": seed, "iters": iters, "config": cfg,
        "champion_sum_pct": round(100 * champ_sum, 2),
        "top10_champion_odds": top10,
        "full_ranking": full_ranking,
        "eventual_winner": {
            "team": winner, "champion_rank": rank_of[winner],
            "champion_pct": round(100 * probs[winner]["champion"], 2),
            "reach_final_pct": round(100 * probs[winner]["reach_final"], 2),
        },
        "finalists": [{
            "team": t, "champion_rank": rank_of[t],
            "champion_pct": round(100 * probs[t]["champion"], 2),
            "reach_final_pct": round(100 * probs[t]["reach_final"], 2),
        } for t in FINALISTS[year]],
        "honest_read": read(),
        "notes": {
            "engine": ("format-correct 32-team resolver (the 2026 monte_carlo is 48-team/best-thirds "
                       "only); reuses fit_pre, chosen_config, tiebreakers, score_matrix, MC contract"),
            "leakage_guard": "strengths fit strictly before the opener (compute_elo/dc.fit fit_max_date)",
            "host_advantage": f"applied to {host} (home throughout), scaled by H_WC_DISCOUNT={H_WC_DISCOUNT}",
        },
    }


def main() -> None:
    df = pd.read_csv(CLEAN, encoding="utf-8")
    altitude = load_altitude()
    cfg = chosen_config()
    BT_DIR.mkdir(parents=True, exist_ok=True)
    for year in ("2018", "2022"):
        rep = run_year(year, df, altitude, cfg)
        (BT_DIR / f"wc{year}_champion_odds.json").write_text(
            json.dumps(rep, indent=2, ensure_ascii=False), encoding="utf-8")
        w = rep["eventual_winner"]
        print(f"WC{year}: champion_sum={rep['champion_sum_pct']}%  "
              f"winner {w['team']} rank #{w['champion_rank']} @ {w['champion_pct']}%  "
              f"top1 {rep['top10_champion_odds'][0]['team']} {rep['top10_champion_odds'][0]['champion_pct']}%")
        print("  " + rep["honest_read"])


if __name__ == "__main__":
    main()

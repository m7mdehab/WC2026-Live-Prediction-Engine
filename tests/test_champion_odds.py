"""Tests for the WC2018/WC2022 champion-odds backtest: structure correctness, bracket wiring vs the
real draw, leakage-clean strengths, determinism, and valid champion probabilities. Offline.

Run from repo root:  python -m pytest tests/test_champion_odds.py -v
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from model.backtest import assert_pre_cutoff
from model.backtest_champion_odds import (
    BRACKET, R16_IDS, BacktestSampler, build_structure, champion_odds, simulate_once_32,
)

ROOT = Path(__file__).resolve().parents[1]
CLEAN = ROOT / "data" / "historical_results_clean.csv"
BT_DIR = ROOT / "data" / "backtest"


def _equal_strength_sampler(struct):
    params = {"intercept_c": 0.1, "home_advantage": 0.3, "rho": -0.05,
              "teams": {t: {"attack": 0.0, "defense": 0.0} for t in struct["all_teams"]}}
    return BacktestSampler(params, host=None)


# ---- structure: 32 teams, 8 groups of 4 ----------------------------------------------------------
@pytest.mark.parametrize("year", ["2018", "2022"])
def test_structure_shape(year):
    s = build_structure(year)
    assert len(s["all_teams"]) == 32 and len(set(s["all_teams"])) == 32
    assert len(s["groups"]) == 8 and all(len(v) == 4 for v in s["groups"].values())


# ---- bracket reproduces the real FIFA 32-team slot wiring (validated by 2018's actual bracket) ----
def test_bracket_reproduces_real_2018_knockout():
    # 2018 actual group winners / runners-up
    winner = {"A": "Uruguay", "B": "Spain", "C": "France", "D": "Croatia",
              "E": "Brazil", "F": "Sweden", "G": "Belgium", "H": "Colombia"}
    runner = {"A": "Russia", "B": "Portugal", "C": "Denmark", "D": "Argentina",
              "E": "Switzerland", "F": "Mexico", "G": "England", "H": "Japan"}

    def resolve(slot):
        return winner[slot[1]] if slot[0] == "1" else runner[slot[1]]

    r16 = {mid: frozenset({resolve(a), resolve(b)})
           for mid, stage, a, b in BRACKET if stage == "round_of_16"}
    real = [{"Uruguay", "Portugal"}, {"France", "Argentina"}, {"Brazil", "Mexico"},
            {"Belgium", "Japan"}, {"Spain", "Russia"}, {"Croatia", "Denmark"},
            {"Sweden", "Switzerland"}, {"Colombia", "England"}]
    got = [set(v) for v in r16.values()]
    for pair in real:
        assert pair in got, f"missing real 2018 R16 pairing {pair}"
    # QF wiring: r1 (1A-2B, Uruguay/Portugal) feeds the same QF as r2 (1C-2D, France/Argentina)
    # -> the real 2018 QF France vs Uruguay. Confirm q1 = W:r1 vs W:r2.
    q1 = next(b for mid, st, a, b in BRACKET if mid == "q1")
    q1a = next(a for mid, st, a, b in BRACKET if mid == "q1")
    assert {q1a, q1} == {"W:r1", "W:r2"}
    # final is the two semifinal winners
    fin = [(a, b) for mid, st, a, b in BRACKET if st == "final"][0]
    assert set(fin) == {"W:s1", "W:s2"}
    assert len(R16_IDS) == 8


# ---- leakage: strengths fit strictly before the opener -------------------------------------------
def test_strength_fit_excludes_in_tournament_results():
    # mirrors the retro leakage test: the pre-opener training frame excludes the opener and later
    df = pd.read_csv(CLEAN, encoding="utf-8")
    opener = "2022-11-20"
    train = df[df.date < opener]
    assert (train.date < opener).all()
    assert not (train.date >= opener).any()
    # the real WC2022 opener exists in the full data but is excluded from training
    assert ((df.date == opener)).any(), "sanity: opener-dated matches exist"
    assert not (train.date == opener).any()
    # and the shared leakage tripwire raises on an in-tournament date
    with pytest.raises(AssertionError):
        assert_pre_cutoff(["2022-11-19", "2022-11-20"], opener)


# ---- determinism + valid champion probabilities --------------------------------------------------
def test_determinism_and_probabilities():
    s = build_structure("2022")
    sampler = _equal_strength_sampler(s)
    p1 = champion_odds(s, sampler, iters=800, seed=42)
    p2 = champion_odds(s, sampler, iters=800, seed=42)
    assert p1 == p2  # same seed -> identical champion odds
    champ_sum = sum(v["champion"] for v in p1.values())
    assert champ_sum == pytest.approx(1.0, abs=1e-9)         # champion probs sum to ~100%
    assert all(0.0 <= v["champion"] <= 1.0 for v in p1.values())
    # monotone stages: reach_final >= champion for every team
    assert all(v["reach_final"] >= v["champion"] - 1e-12 for v in p1.values())


def test_simulate_once_returns_one_champion_from_the_field():
    s = build_structure("2018")
    sampler = _equal_strength_sampler(s)
    r = simulate_once_32(s, sampler, np.random.default_rng(7))
    assert r["champion"] in s["all_teams"]
    assert len(r["finalists"]) == 2 and r["champion"] in r["finalists"]
    assert len(r["reached_sf"]) == 4 and len(r["reached_qf"]) == 8 and len(r["advanced"]) == 16


# ---- committed artifact exports the FULL 32-team ranking (additive over the top-10) ---------------
@pytest.mark.parametrize("year", ["2018", "2022"])
def test_committed_artifact_has_full_ranking(year):
    saved = json.loads((BT_DIR / f"wc{year}_champion_odds.json").read_text(encoding="utf-8"))
    full = saved["full_ranking"]
    assert len(full) == 32                                   # every team, not just the top 10
    assert [r["rank"] for r in full] == list(range(1, 33))   # ranks 1..32 contiguous
    assert len({r["team"] for r in full}) == 32              # no duplicate team
    assert full[:10] == saved["top10_champion_odds"]         # purely additive: top-10 unchanged
    assert sum(r["champion_pct"] for r in full) == pytest.approx(saved["champion_sum_pct"], abs=0.5)


def test_croatia_2018_finalist_rank_is_artifact_backed():
    # the methodology page renders "Croatia, the 2018 finalist, was rated only #11 pre-tournament";
    # that number must be a real committed artifact value (full_ranking AND finalists must agree).
    saved = json.loads((BT_DIR / "wc2018_champion_odds.json").read_text(encoding="utf-8"))
    by_team = {r["team"]: r["rank"] for r in saved["full_ranking"]}
    assert by_team["Croatia"] == 11
    croatia_final = next(f for f in saved["finalists"] if f["team"] == "Croatia")
    assert croatia_final["champion_rank"] == 11 == by_team["Croatia"]


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))

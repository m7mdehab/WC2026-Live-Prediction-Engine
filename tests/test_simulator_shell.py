"""Phase 2.6 sanity tests for the simulator format shell.

(a) deterministic win-probability inputs produce the expected (deterministic) bracket
(b) uniform 33/33/33 inputs produce roughly uniform group outcomes over 10k iters
(c) no same-group Round-of-32 pairings are ever produced
(d) every Annex C combo is reachable; forced combo 1 and combo 495 wire correctly
"""
from __future__ import annotations

import itertools
import json
from pathlib import Path

import numpy as np
import pytest

from simulator.engine import assign_r32, monte_carlo, simulate_once
from simulator.loaders import DATA, load
from simulator.sampler import MatchSampler, RandomTripleSampler, UniformSampler

DATA_T = load()


class StrengthSampler(MatchSampler):
    """Deterministic: the team with the better (lower) FIFA rank always wins."""
    def __init__(self, fifa_latest):
        self.rank = fifa_latest

    def triple(self, match_id, a, b):
        return (1.0, 0.0, 0.0) if self.rank[a] < self.rank[b] else (0.0, 0.0, 1.0)


# ---------------------------------------------------------------- (a)
def test_deterministic_inputs_produce_expected_bracket():
    sampler = StrengthSampler(DATA_T.fifa_latest)
    strongest = min(DATA_T.all_teams, key=lambda t: DATA_T.fifa_latest[t])  # France (#1)

    # champion is deterministic across seeds, and is the globally strongest team
    finalists_runs = []
    for seed in (1, 2, 7):
        probs, _, _ = monte_carlo(DATA_T, sampler, 20, seed)
        assert probs[strongest]["champion"] == 1.0
        assert probs[strongest]["advance_group"] == 1.0
        assert probs[strongest]["reach_final"] == 1.0
        finalists = tuple(sorted(t for t in DATA_T.all_teams if probs[t]["reach_final"] > 0))
        finalists_runs.append(finalists)

    # fully determined => identical finalist pair every run, and the strongest is in it
    assert len(set(finalists_runs)) == 1
    assert strongest in finalists_runs[0]
    assert len(finalists_runs[0]) == 2


# ---------------------------------------------------------------- (b)
def test_uniform_inputs_roughly_uniform():
    probs, _, _ = monte_carlo(DATA_T, UniformSampler(), 10000, 123)

    adv = np.array([probs[t]["advance_group"] for t in DATA_T.all_teams])
    champ = np.array([probs[t]["champion"] for t in DATA_T.all_teams])

    # each team advances with ~0.667 (50% top-2 + 8/12 of the 25% thirds)
    assert adv.min() > 0.60 and adv.max() < 0.73
    assert abs(adv.mean() - 2 / 3) < 0.01
    # champion ~ 1/48 = 0.0208 for everyone (no team systematically favoured)
    assert champ.min() > 0.008 and champ.max() < 0.040
    assert abs(champ.sum() - 1.0) < 1e-9


# ---------------------------------------------------------------- (c)
def test_no_same_group_r32_pairings():
    sampler = RandomTripleSampler(seed=99)
    rng = np.random.default_rng(99)
    tg = DATA_T.team_group
    for _ in range(1000):
        res = simulate_once(DATA_T, sampler, rng)
        for match_id, a, b in res.r32_pairings:
            assert tg[a] != tg[b], f"same-group R32 pairing {match_id}: {a} vs {b}"
        assert len(res.r32_pairings) == 16


# ---------------------------------------------------------------- (d)
def test_all_combos_reachable_and_forced_combos():
    # every C(12,8)=495 third-group combination is present in the lookup
    assert len(DATA_T.combo_lookup) == 495
    for gs in itertools.combinations("ABCDEFGHIJKL", 8):
        assert tuple(sorted(gs)) in DATA_T.combo_lookup, f"missing combo for {gs}"

    combos = json.loads((DATA / "third_place_matrix_2026.json").read_text(encoding="utf-8"))["combinations"]
    by_id = {c["combo_id"]: c for c in combos}

    # synthetic standings: group G -> [G1, G2, G3, G4] (winner, runner, third, fourth)
    standings = {g: [f"{g}1", f"{g}2", f"{g}3", f"{g}4"] for g in "ABCDEFGHIJKL"}
    best3_matches = [m for m in DATA_T.ko_matches
                     if m.stage == "round_of_32" and m.team_b_slot.startswith("best3:")]

    for cid in (1, 495):
        combo = by_id[cid]
        qual = combo["qualifying_third_place_groups"]
        pairings = {mid: (a, b) for mid, a, b in assign_r32(DATA_T, standings, qual)}
        for m in best3_matches:
            winner_slot = m.team_a_slot                 # e.g. "1E"
            expected_third = combo["r32_assignments"][winner_slot]   # e.g. "3F"
            a, b = pairings[m.match_id]
            assert a == f"{winner_slot[1]}1"            # winner of that group
            assert b == f"{expected_third[1]}3"        # the combo's third-placed team
            assert a[0] != b[0]                          # no same-group pairing


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))

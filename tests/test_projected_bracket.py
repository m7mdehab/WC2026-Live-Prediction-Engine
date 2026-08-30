"""Tests for build_projected_bracket's optional force_champion (champion-conditional CURRENT bracket).

force_champion makes the named team the projected winner of every match it plays, so it advances down
its fixed slot path and wins M104 -> champion == force_champion, gold path == its route. p_a/p_draw/
p_b/xg are never altered. force_champion=None must be byte-identical to the prior pure-argmax build
(the cond0/Initial path). A team that never occupies a bracket slot logs a warning and falls back to
the argmax champion.

Offline: load() + DixonColesSampler, no Supabase. Deterministic via seed=42. The byte-identity test
compares against tests/fixtures/projected_bracket_baseline_seed42_iters1500.json, generated from the
PRE-CHANGE (b8a3836) builder.

Run from repo root:  python -m pytest tests/test_projected_bracket.py -v
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest

from simulator.engine import monte_carlo
from simulator.loaders import load
from simulator.model_sampler import DixonColesSampler
from simulator.projected_bracket import build_projected_bracket

SEED, ITERS = 42, 1500
DATA = load()
SAMPLER = DixonColesSampler()

# the force_champion=None build (must equal the pre-change argmax baseline)
BASE = build_projected_bracket(DATA, SAMPLER, ITERS, SEED)
BY_ID = {m.match_id: m for m in BASE.matches}
BRACKET_TEAMS = {t for m in BASE.matches for t in (m.team_a, m.team_b)}
FINAL = BY_ID["M104"]
FINALISTS = {FINAL.team_a, FINAL.team_b}

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "projected_bracket_baseline_seed42_iters1500.json")
    .read_text(encoding="utf-8")
)

# the five non-third-place knockout rounds a champion traverses (R32 -> Final)
PATH_STAGES = {"round_of_32", "round_of_16", "quarter_finals", "semi_finals", "final"}


def _path(pb, team):
    return [m for m in pb.matches if team in (m.team_a, m.team_b)]


# ---------------------------------------------------------------- (1) None == pre-change baseline
def test_force_champion_none_is_byte_identical_to_pre_change_baseline():
    """force_champion=None reproduces the b8a3836 argmax output exactly: champion, every occupant,
    every proj_winner, every champion_path flag, and the (unchanged) p_*/xg numbers."""
    assert BASE.champion == FIXTURE["champion"]
    fx = {m["match_id"]: m for m in FIXTURE["matches"]}
    assert {m.match_id for m in BASE.matches} == set(fx)
    for m in BASE.matches:
        f = fx[m.match_id]
        assert m.team_a == f["team_a"], m.match_id
        assert m.team_b == f["team_b"], m.match_id
        assert m.proj_winner == f["proj_winner"], m.match_id
        assert m.champion_path == f["champion_path"], m.match_id
        # p_*/xg are the honest Dixon-Coles numbers and must be untouched by adding the parameter
        assert m.p_a == pytest.approx(f["p_a"], abs=1e-12)
        assert m.p_draw == pytest.approx(f["p_draw"], abs=1e-12)
        assert m.p_b == pytest.approx(f["p_b"], abs=1e-12)
        assert m.xg_a == pytest.approx(f["xg_a"], abs=1e-12)
        assert m.xg_b == pytest.approx(f["xg_b"], abs=1e-12)


# ---------------------------------------------------------------- (2) forced team the argmax eliminates
def test_force_champion_drives_an_eliminated_team_to_the_title():
    """A bracket team the argmax eliminates BEFORE the final, when forced, wins every match on its
    path, becomes champion, and owns exactly the gold path (R32 -> Final)."""
    candidates = sorted(BRACKET_TEAMS - FINALISTS)  # argmax eliminates these before the final
    assert candidates, "expected at least one non-finalist bracket team"
    t = candidates[0]
    assert BASE.champion != t  # precondition: not already the argmax champion

    pb = build_projected_bracket(DATA, SAMPLER, ITERS, SEED, force_champion=t)
    assert pb.champion == t
    fin = next(m for m in pb.matches if m.match_id == "M104")
    assert fin.proj_winner == t
    assert t in (fin.team_a, fin.team_b)

    path = _path(pb, t)
    assert all(m.proj_winner == t for m in path), "forced champion must win every match it plays"
    # champion_path is flagged on exactly the matches the champion appears in
    flagged = [m for m in pb.matches if m.champion_path]
    assert {m.match_id for m in flagged} == {m.match_id for m in path}
    # the route is one match per round, R32 -> Final, never the third-place playoff
    assert len(path) == 5
    assert {m.stage for m in path} == PATH_STAGES
    # p_*/xg stay the honest Dixon-Coles numbers (the force never edits a probability)
    for m in path:
        assert abs((m.p_a + m.p_draw + m.p_b) - 1.0) < 1e-6


# ---------------------------------------------------------------- (3) forcing the argmax champion is a no-op
def test_force_champion_equal_to_argmax_is_a_noop():
    """Forcing the team the argmax already crowns yields output identical to the unforced build."""
    pb = build_projected_bracket(DATA, SAMPLER, ITERS, SEED, force_champion=BASE.champion)
    assert pb.champion == BASE.champion
    for m in pb.matches:
        b = BY_ID[m.match_id]
        assert (m.team_a, m.team_b, m.proj_winner, m.champion_path) == (
            b.team_a, b.team_b, b.proj_winner, b.champion_path), m.match_id


# ---------------------------------------------------------------- (4) edge: not in the bracket -> warn + fallback
def test_force_champion_absent_falls_back_to_argmax_with_warning(caplog):
    """A team that never occupies a bracket slot cannot be forced: no crash, a warning is logged, and
    the champion falls back to the pure-argmax winner (output equals the unforced build)."""
    absentees = sorted(set(DATA.all_teams) - BRACKET_TEAMS)
    assert absentees, "expected teams that did not qualify as projected R32 occupants"
    absent = absentees[0]

    with caplog.at_level(logging.WARNING, logger="simulator.projected_bracket"):
        pb = build_projected_bracket(DATA, SAMPLER, ITERS, SEED, force_champion=absent)

    assert pb.champion == BASE.champion
    for m in pb.matches:
        assert m.proj_winner == BY_ID[m.match_id].proj_winner, m.match_id
    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any("not a participant" in w and absent in w for w in warnings), warnings


# ---------------------------------------------------------------- (5) recalc derivation: title leader agrees
def test_title_leader_derivation_makes_bracket_champion_agree_with_title_race():
    """Mirror recalc: title_leader = argmax team_probabilities.champion. Forcing it makes the bracket
    champion equal the title leader, so the projected bracket and the title race agree by construction."""
    probs, _, _ = monte_carlo(DATA, SAMPLER, ITERS, SEED)
    title_leader = max(DATA.all_teams, key=lambda t: probs[t]["champion"])
    # the derivation is the true argmax of the champion probability
    assert all(probs[title_leader]["champion"] >= probs[t]["champion"] for t in DATA.all_teams)
    # the title leader is a projected bracket occupant (a top team always qualifies), so the force fires
    assert title_leader in BRACKET_TEAMS
    pb = build_projected_bracket(DATA, SAMPLER, ITERS, SEED, force_champion=title_leader)
    assert pb.champion == title_leader


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))

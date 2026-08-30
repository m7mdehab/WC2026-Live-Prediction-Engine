"""Walk-forward CHAMPION-ODDS convergence for WC2018 and WC2022 (offline backtest).

The sibling module model.backtest_champion_odds answers "did the pre-tournament model pick the
winner" (a single, pre-opener champion-odds run). This module answers a stricter question: as the
ACTUAL knockout results come in, does the model's view of the remaining field converge on the team
that actually won, and how fast?

At each stage (the round-of-16 field, post-R16, post-QF, post-SF) we condition ONLY on the ACTUAL knockout
results UP TO that stage (the teams that actually advanced), re-simulate the REMAINING bracket, and
record where the eventual champion ranks among the remaining teams (its champion-odds and rank), plus
the remaining-field top list.

LEAKAGE GUARD (two parts, both asserted at every stage):
  1. Strengths stay at the pre-opener fit (model.backtest.fit_pre with fit_max_date = the opener). We
     do NOT refit on in-tournament results - the conditioning is purely on which teams advanced, not
     on re-learning strengths from the in-tournament scores. This matches the static-fit finding in
     the retrodiction report (in-tournament refitting did not help).
  2. We condition only on results UP TO the stage, never later. assert_no_future_leak() verifies the
     fixed-result set for a stage references only matches whose bracket round is at or before that
     stage, and that every "future" match is genuinely re-simulated (not pinned to its actual result).

REUSE: the merged 32-team resolver in model.backtest_champion_odds (BRACKET, BacktestSampler,
build_structure, the score_matrix sampling, the FIFA-Article-13 tiebreakers) is reused verbatim. The
ACTUAL knockout advancers are a fixed, leakage-safe input (they are facts that happened, gated by
stage). Determinism: numpy default_rng(SEED), SEED = 42, ITERS standard. Writes ONLY data/backtest/
JSON; no Supabase, no DB, no production-artifact mutation. Does not touch the six untouchable files.

Run from repo root:  python -m model.backtest_champion_convergence
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

from model.backtest import WC_HOSTS, WC_OPENERS, fit_pre
from model.backtest_retro import chosen_config
from model.elo import load_altitude
from model.backtest_champion_odds import (
    BRACKET,
    QF_IDS,
    R16_IDS,
    SF_IDS,
    BacktestSampler,
    build_structure,
)
from simulator import tiebreakers as tb

ROOT = Path(__file__).resolve().parents[1]
CLEAN = ROOT / "data" / "historical_results_clean.csv"
BT_DIR = ROOT / "data" / "backtest"
SEED = 42
ITERS = 50_000

WINNERS = {"2018": "France", "2022": "Argentina"}

# ---- ACTUAL knockout advancers, keyed by bracket match id -----------------------------------------
# Each KO match in BRACKET is mapped to the team that ACTUALLY advanced from it (penalty-shootout
# winners resolved to the real qualifier, since the predictions CSV stores only 90-minute scores).
# Group winners/runners are the real WC2018/WC2022 group standings (the slots 1X/2X resolve to these),
# validated against the real R16 pairings in tests. [FLAGGED sub-decision: these are recorded facts of
# what happened, gated by stage so no future stage's result is ever exposed early.]
ACTUAL = {
    "2018": {
        # real group standings (slot 1X = winner, 2X = runner-up)
        "winner": {"A": "Uruguay", "B": "Spain", "C": "France", "D": "Croatia",
                   "E": "Brazil", "F": "Sweden", "G": "Belgium", "H": "Colombia"},
        "runner": {"A": "Russia", "B": "Portugal", "C": "Denmark", "D": "Argentina",
                   "E": "Switzerland", "F": "Mexico", "G": "England", "H": "Japan"},
        # R16 winners: r1 Uruguay 2-1 Portugal; r2 France 4-3 Argentina; r3 Brazil 2-0 Mexico;
        #   r4 Belgium 3-2 Japan; r5 Spain 1-1 Russia (Russia on pens); r6 Croatia 1-1 Denmark
        #   (Croatia on pens); r7 Sweden 1-0 Switzerland; r8 Colombia 1-1 England (England on pens)
        "r1": "Uruguay", "r2": "France", "r3": "Brazil", "r4": "Belgium",
        "r5": "Russia", "r6": "Croatia", "r7": "Sweden", "r8": "England",
        # QF winners: q1 France 2-0 Uruguay; q2 Belgium 2-1 Brazil; q3 Croatia 2-2 Russia
        #   (Croatia on pens); q4 England 2-0 Sweden
        "q1": "France", "q2": "Belgium", "q3": "Croatia", "q4": "England",
        # SF winners: s1 France 1-0 Belgium; s2 Croatia 2-1 England
        "s1": "France", "s2": "Croatia",
        # final: France 4-2 Croatia
        "f": "France",
    },
    "2022": {
        "winner": {"A": "Netherlands", "B": "England", "C": "Argentina", "D": "France",
                   "E": "Japan", "F": "Morocco", "G": "Brazil", "H": "Portugal"},
        "runner": {"A": "Senegal", "B": "United States", "C": "Poland", "D": "Australia",
                   "E": "Spain", "F": "Croatia", "G": "Switzerland", "H": "South Korea"},
        # R16 winners: r1 Netherlands 3-1 USA; r2 Argentina 2-1 Australia; r3 Japan 1-1 Croatia
        #   (Croatia on pens); r4 Brazil 4-1 South Korea; r5 England 3-0 Senegal; r6 France 3-1 Poland;
        #   r7 Morocco 0-0 Spain (Morocco on pens); r8 Portugal 6-1 Switzerland
        "r1": "Netherlands", "r2": "Argentina", "r3": "Croatia", "r4": "Brazil",
        "r5": "England", "r6": "France", "r7": "Morocco", "r8": "Portugal",
        # QF winners: q1 Argentina 2-2 Netherlands (Argentina on pens); q2 Croatia 1-1 Brazil
        #   (Croatia on pens); q3 France 2-1 England; q4 Morocco 1-0 Portugal
        "q1": "Argentina", "q2": "Croatia", "q3": "France", "q4": "Morocco",
        # SF winners: s1 Argentina 3-0 Croatia; s2 France 2-0 Morocco
        "s1": "Argentina", "s2": "France",
        # final: Argentina 3-3 France (Argentina on pens)
        "f": "Argentina",
    },
}

# Stages in walk-forward order. `fixed` = the bracket match ids whose ACTUAL winner is known and
# pinned at that stage; everything not pinned is re-simulated. The first stage pins nothing (the group
# stage is already complete, so it is the 16-team round-of-16 field, NOT the 32-team pre-tournament).
# Each stage is LABELLED by the round its remaining field will contest: 16 teams -> "Round of 16",
# 8 -> "Quarter-finals", 4 -> "Semi-finals", 2 -> "Final".
STAGES = [
    ("pre", "Round of 16", []),
    ("post_r16", "Quarter-finals", list(R16_IDS)),
    ("post_qf", "Semi-finals", list(R16_IDS) + list(QF_IDS)),
    ("post_sf", "Final", list(R16_IDS) + list(QF_IDS) + list(SF_IDS)),
]
# The set of match ids that belong to each round (for the leakage assertion).
ROUND_OF = {mid: stage for mid, stage, _a, _b in BRACKET}


def _resolve_groups(struct, actual, rng):
    """Group winners/runners. At every stage the REAL group standings are known (the group stage is
    complete before any KO stage), so we always use the actual standings to seed slots 1X/2X. This is
    leakage-safe: the group stage precedes every walk-forward stage."""
    return dict(actual["winner"]), dict(actual["runner"])


def simulate_once_conditioned(struct, sampler, actual, fixed_ids, rng) -> str:
    """One conditioned tournament: pin the ACTUAL winners of `fixed_ids`, re-simulate the rest, return
    the champion. Group standings are the real ones (group stage precedes all KO stages)."""
    winner, runner = _resolve_groups(struct, actual, rng)
    win, lose = {}, {}

    def resolve(slot: str) -> str:
        kind = slot[0]
        if kind == "1":
            return winner[slot[1]]
        if kind == "2":
            return runner[slot[1]]
        ref = slot[2:]                      # "W:r1" / "L:s1"
        return win[ref] if kind == "W" else lose[ref]

    fixed = set(fixed_ids)
    for mid, _stage, sa_slot, sb_slot in BRACKET:
        a, b = resolve(sa_slot), resolve(sb_slot)
        if mid in fixed:
            # Condition on the ACTUAL result of this match (a known fact up to this stage).
            w = actual[mid]
            assert w in (a, b), f"actual winner {w} of {mid} not in resolved pair {(a, b)}"
            l = b if w == a else a
        else:
            w, l = sampler.knockout_winner(a, b, rng)
        win[mid], lose[mid] = w, l

    return win["f"]


def conditioned_champion_odds(struct, sampler, actual, fixed_ids, iters=ITERS, seed=SEED):
    """Champion odds over the REMAINING field, conditioned on the ACTUAL `fixed_ids` winners."""
    rng = np.random.default_rng(seed)
    counts: Counter = Counter()
    for _ in range(iters):
        counts[simulate_once_conditioned(struct, sampler, actual, fixed_ids, rng)] += 1
    return {t: counts[t] / iters for t in counts}


def remaining_field(actual, fixed_ids) -> list[str]:
    """Teams still alive AFTER conditioning on `fixed_ids` (i.e. eligible to be the eventual champion):
    every team not eliminated as the loser of a fixed (already-played) match."""
    winner, runner = dict(actual["winner"]), dict(actual["runner"])
    alive = set(winner.values()) | set(runner.values())
    win, lose = {}, {}

    def resolve(slot: str) -> str:
        kind = slot[0]
        if kind == "1":
            return winner[slot[1]]
        if kind == "2":
            return runner[slot[1]]
        ref = slot[2:]
        return win[ref] if kind == "W" else lose[ref]

    fixed = set(fixed_ids)
    for mid, _stage, sa_slot, sb_slot in BRACKET:
        if mid not in fixed:
            continue
        a, b = resolve(sa_slot), resolve(sb_slot)
        w = actual[mid]
        l = b if w == a else a
        win[mid], lose[mid] = w, l
        alive.discard(l)
    return sorted(alive)


def assert_no_future_leak(stage_key, fixed_ids):
    """Leakage tripwire: the pinned-result set for a stage must contain ONLY matches whose round is at
    or before that stage. A later round being pinned would expose a future result early."""
    allowed = {
        "pre": set(),
        "post_r16": {"round_of_16"},
        "post_qf": {"round_of_16", "quarter_final"},
        "post_sf": {"round_of_16", "quarter_final", "semi_final"},
    }[stage_key]
    for mid in fixed_ids:
        rnd = ROUND_OF[mid]
        if rnd not in allowed:
            raise AssertionError(
                f"leakage: stage {stage_key} pins {mid} ({rnd}) which is after the stage")
    # And the final is NEVER pinned at any walk-forward stage (the answer must stay unknown).
    if "f" in fixed_ids:
        raise AssertionError(f"leakage: stage {stage_key} pins the final result")


def run_year(year: str, df, altitude, cfg, iters=ITERS, seed=SEED) -> dict:
    opener = WC_OPENERS[year]
    host = WC_HOSTS[year]
    params, _ = fit_pre(df, altitude, opener, half_life=cfg["half_life"],
                        lambda_prior=cfg["lambda_prior"], tier_weights=cfg["tiers"])
    struct = build_structure(year)
    sampler = BacktestSampler(params, host=host)
    winner = WINNERS[year]
    actual = ACTUAL[year]
    assert actual["f"] == winner, f"{year}: actual final winner mismatch"

    stages_out = []
    became_no1_at = None
    for stage_key, stage_label, fixed_ids in STAGES:
        assert_no_future_leak(stage_key, fixed_ids)
        odds = conditioned_champion_odds(struct, sampler, actual, fixed_ids, iters=iters, seed=seed)
        alive = remaining_field(actual, fixed_ids)
        assert winner in alive, f"{year}/{stage_key}: eventual winner not in remaining field"
        # rank the eventual champion among the REMAINING field (alive teams), ties broken by name
        ranking = sorted(((t, odds.get(t, 0.0)) for t in alive), key=lambda kv: (-kv[1], kv[0]))
        rank_of = {t: i + 1 for i, (t, _) in enumerate(ranking)}
        champ_rank = rank_of[winner]
        if became_no1_at is None and champ_rank == 1:
            became_no1_at = stage_label
        top = [{"rank": i + 1, "team": t, "champion_pct": round(100 * p, 2)}
               for i, (t, p) in enumerate(ranking[:8])]
        stages_out.append({
            "stage": stage_key,
            "label": stage_label,
            "remaining_teams": len(alive),
            "fixed_matches": list(fixed_ids),
            "champion": {
                "team": winner,
                "rank_among_remaining": champ_rank,
                "champion_pct": round(100 * odds.get(winner, 0.0), 2),
            },
            "remaining_top": top,
        })

    ranks = [s["champion"]["rank_among_remaining"] for s in stages_out]
    monotone = all(ranks[i + 1] <= ranks[i] for i in range(len(ranks) - 1))
    # earliest stage (before the final) where the eventual champion was the #1 remaining pick
    converged = became_no1_at is not None
    read = _honest_read(year, winner, stages_out, became_no1_at, monotone)

    return {
        "year": year, "opener": opener, "fit_max_date": opener, "host": host,
        "seed": seed, "iters": iters, "config": cfg,
        "eventual_champion": winner,
        "stages": stages_out,
        "champion_rank_trajectory": ranks,
        "rank_trajectory_monotone": monotone,
        "became_number_one_at": became_no1_at,
        "converged_before_final": converged,
        "honest_read": read,
        "notes": {
            "engine": ("reuses the 32-team resolver in model.backtest_champion_odds (BRACKET, "
                       "BacktestSampler, build_structure, tiebreakers, score_matrix); conditions on "
                       "ACTUAL advancers per stage, re-simulates the remaining bracket"),
            "leakage_guard": ("strengths fixed at the pre-opener fit (no in-tournament refit); each "
                              "stage pins ONLY results up to that round (assert_no_future_leak); the "
                              "final is never pinned"),
            "rank_definition": ("the eventual champion's rank by champion-odds among the teams still "
                                "alive after the stage's actual results (the remaining field)"),
            "narrowing_caveat": ("the remaining field shrinks each round, so some of the rank rise is "
                                 "mechanical via elimination, not the model sharpening"),
        },
    }


def _honest_read(year, winner, stages, became_no1_at, monotone) -> str:
    first = stages[0]                       # the 16-team round-of-16 field (after the group stage)
    last = stages[-1]                       # the two-team final field
    pre = first["champion"]
    parts = [f"{winner} (the actual {year} champion) started #{pre['rank_among_remaining']} of "
             f"{first['remaining_teams']} at {pre['champion_pct']}% in the round-of-16 field"]
    if became_no1_at is None:
        sf = last["champion"]
        parts.append(f"and never became the model's #1 remaining pick before the final "
                     f"(rose to #{sf['rank_among_remaining']} among the last two at {sf['champion_pct']}%)")
    elif became_no1_at == first["label"]:
        parts.append("and was already the model's #1 pick in the round-of-16 field")
    else:
        parts.append(f"and became the model's #1 remaining pick by the {became_no1_at.lower()} field")
    caveat = ("the field shrinks each round, so some of the rise is mechanical via elimination"
              if monotone else "the trajectory is non-monotone (re-simulation noise / matchup draw)")
    parts.append(f"({caveat})")
    return ", ".join(parts[:2]) + " " + parts[2] + "."


def main() -> None:
    df = pd.read_csv(CLEAN, encoding="utf-8")
    altitude = load_altitude()
    cfg = chosen_config()
    BT_DIR.mkdir(parents=True, exist_ok=True)
    for year in ("2018", "2022"):
        rep = run_year(year, df, altitude, cfg)
        (BT_DIR / f"wc{year}_champion_convergence.json").write_text(
            json.dumps(rep, indent=2, ensure_ascii=False), encoding="utf-8")
        traj = " -> ".join(f"#{r}" for r in rep["champion_rank_trajectory"])
        print(f"WC{year}: {rep['eventual_champion']} rank trajectory (pre/post-R16/post-QF/post-SF): "
              f"{traj}  became #1 at: {rep['became_number_one_at']}")
        print("  " + rep["honest_read"])


if __name__ == "__main__":
    main()

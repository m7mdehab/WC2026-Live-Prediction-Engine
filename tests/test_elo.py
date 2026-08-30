"""Phase 2.1 Elo sanity tests."""
from __future__ import annotations

import pandas as pd

from model.elo import compute_elo


def _df(rows):
    cols = ["date", "home_team_canon", "away_team_canon", "home_score", "away_score",
            "neutral", "tournament_weight"]
    return pd.DataFrame(rows, columns=cols)


def test_winner_rises_above_1500():
    # one team beats 10 distinct lower opponents (neutral, so no home-adv confound)
    rows = []
    for i in range(10):
        rows.append([f"2020-01-{i+1:02d}", "Winner", f"Opp{i}", 2, 0, True, 1.0])
    ratings, _ = compute_elo(_df(rows))
    r = dict(zip(ratings.team, ratings.rating))
    assert r["Winner"] > 1500
    for i in range(10):
        assert r[f"Opp{i}"] < 1500
    # zero-sum: total rating change is ~0
    assert abs(sum(r.values()) - 1500 * len(r)) < 1e-6


def test_mirror_image_fixtures():
    # A 2-0 B  vs  the mirrored B 2-0 A  -> ratings swap exactly
    t1 = compute_elo(_df([["2020-06-01", "A", "B", 2, 0, True, 1.0]]))[0]
    t2 = compute_elo(_df([["2020-06-01", "B", "A", 2, 0, True, 1.0]]))[0]
    r1 = dict(zip(t1.team, t1.rating))
    r2 = dict(zip(t2.team, t2.rating))
    assert abs((r1["A"] - 1500) - (r2["B"] - 1500)) < 1e-9
    assert abs((r1["B"] - 1500) - (r2["A"] - 1500)) < 1e-9


def test_tournament_weight_scales_update():
    # same match, weight 1.0 vs 0.2 -> rating change scales linearly with the weight
    full = compute_elo(_df([["2020-06-01", "A", "B", 2, 1, True, 1.0]]))[0]
    light = compute_elo(_df([["2020-06-01", "A", "B", 2, 1, True, 0.2]]))[0]
    df_full = dict(zip(full.team, full.rating))
    df_light = dict(zip(light.team, light.rating))
    chg_full = df_full["A"] - 1500
    chg_light = df_light["A"] - 1500
    assert chg_full > 0 and chg_light > 0
    assert abs(chg_full - 5.0 * chg_light) < 1e-6   # weight ratio 1.0/0.2 = 5


def test_home_advantage_helps_home_team():
    # identical 1-1 draw: at home (non-neutral) the home team should GAIN rating
    # (it was expected to win more than 50%, a draw under-performs -> but home-adv means
    #  a draw at home slightly lowers the home team; check the asymmetry vs neutral)
    home = compute_elo(_df([["2020-06-01", "A", "B", 1, 1, False, 1.0]]))[0]
    neut = compute_elo(_df([["2020-06-01", "A", "B", 1, 1, True, 1.0]]))[0]
    rh = dict(zip(home.team, home.rating))
    rn = dict(zip(neut.team, neut.rating))
    # at home A is favoured, so a draw costs A rating; on neutral a draw is even (no change)
    assert rh["A"] < rn["A"]
    assert abs(rn["A"] - 1500) < 1e-9

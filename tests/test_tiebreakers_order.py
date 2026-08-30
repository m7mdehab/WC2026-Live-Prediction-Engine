"""ORDER-PINNING tests for the group tiebreak chain (simulator/tiebreakers.py).

Motivated by a sibling-session finding: an adapter that silently REORDERS a sort key passes every
unit test that only checks "the right team wins" on decisive inputs. These tests construct groups
where every criterion but ONE is level (or points the other way), so a reordered chain FAILS:

  - H2H-BEFORE-OVERALL: the FIFA 2026 chain applies head-to-head among the tied teams BEFORE
    overall goal difference (a 2026 change from the historical overall-first WC chain; see the
    module docstring + docs/phase_1_corrections.md). A team that wins the head-to-head but has
    the WORSE overall GD must still rank first.
  - OVERALL GD BEFORE GS in step 2 (after a fully level head-to-head).
  - Thirds chain: overall GD before GS (no head-to-head across groups).

Run:  python -m pytest tests/test_tiebreakers_order.py -q
"""
from __future__ import annotations

from simulator.tiebreakers import rank_group, rank_thirds, overall_stats

FIFA_LATEST = {"AAA": 1, "BBB": 2, "CCC": 3, "DDD": 4}
FIFA_PREV: list[dict] = []


def test_h2h_decides_before_overall_gd():
    """A and B tied on 6 points; A won the head-to-head 1-0 but B's overall GD (+7) crushes
    A's (+1). The 2026 chain ranks A first (H2H step 1 precedes overall step 2). A chain
    reordered to overall-first would rank B first and FAIL here."""
    results = [
        ("AAA", "BBB", 1, 0),   # A wins the H2H
        ("AAA", "CCC", 1, 0),
        ("AAA", "DDD", 0, 1),   # A: 6 pts, GD +1
        ("BBB", "CCC", 4, 0),
        ("BBB", "DDD", 4, 0),   # B: 6 pts, GD +7
        ("CCC", "DDD", 0, 0),
    ]
    teams = ["AAA", "BBB", "CCC", "DDD"]
    order = rank_group(teams, results, FIFA_LATEST, FIFA_PREV)
    assert order[0] == "AAA" and order[1] == "BBB", (
        f"H2H must precede overall GD in the 2026 chain; got {order}")


def test_overall_gd_before_gs_when_h2h_is_level():
    """A and B tied on 5 points with a drawn head-to-head (H2H fully level). Overall: A has the
    BETTER GD (+2 vs +1) but far FEWER goals scored (2 vs 5). Step 2 is GD then GS, so A ranks
    first; a GS-before-GD reorder would rank B first and FAIL here."""
    results = [
        ("AAA", "BBB", 0, 0),   # level H2H
        ("AAA", "CCC", 2, 0),
        ("AAA", "DDD", 0, 0),   # A: 5 pts, GD +2, GS 2
        ("BBB", "DDD", 5, 4),
        ("BBB", "CCC", 0, 0),   # B: 5 pts, GD +1, GS 5
        ("CCC", "DDD", 1, 0),
    ]
    teams = ["AAA", "BBB", "CCC", "DDD"]
    order = rank_group(teams, results, FIFA_LATEST, FIFA_PREV)
    assert order[0] == "AAA" and order[1] == "BBB", (
        f"overall GD must precede overall GS; got {order}")


def test_thirds_gd_before_gs():
    """Third-placed cross-group ranking has NO head-to-head: points, then GD, then GS. X has the
    better GD with fewer goals; Y the reverse. X must rank ahead; a GS-first reorder FAILS."""
    overall = {
        "XXX": {"pts": 4, "gd": 1, "gs": 2},
        "YYY": {"pts": 4, "gd": 0, "gs": 6},
    }
    order = rank_thirds(["YYY", "XXX"], overall, {"XXX": 9, "YYY": 8}, [])
    assert order == ["XXX", "YYY"], f"thirds chain is pts -> GD -> GS; got {order}"


def test_thirds_gs_before_fifa():
    """Same points and GD; GS must decide BEFORE the FIFA-ranking fallback (here the FIFA rank
    points the other way)."""
    overall = {
        "XXX": {"pts": 4, "gd": 1, "gs": 5},
        "YYY": {"pts": 4, "gd": 1, "gs": 2},
    }
    order = rank_thirds(["YYY", "XXX"], overall, {"XXX": 30, "YYY": 1}, [])
    assert order == ["XXX", "YYY"], f"thirds GS must precede the FIFA fallback; got {order}"


def test_overall_stats_shape_sanity():
    """The stats the chain sorts on: a quick end-to-end sanity of pts/gd/gs accounting."""
    st = overall_stats(["AAA", "BBB"], [("AAA", "BBB", 2, 1)])
    assert st["AAA"] == {"pts": 3, "gf": 2, "ga": 1, "gd": 1, "gs": 2}
    assert st["BBB"]["pts"] == 0 and st["BBB"]["gd"] == -1

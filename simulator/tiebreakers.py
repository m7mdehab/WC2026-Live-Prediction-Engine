"""FIFA Article 13 group ranking -- the project's #1 correctness risk.

Implements the CORRECTED chain (see docs/phase_1_corrections.md + data/group_rules_2026.json):

Within a group:
  primary: points
  step 1 (head-to-head, among the tied teams only): 1a H2H points, 1b H2H GD, 1c H2H GS
          -> if partial separation, RE-APPLY 1a-1c to the remaining tied subset only
  step 2 (overall, no restart to step 1): 2d overall GD, 2e overall GS, [2f conduct]
  step 3 (FIFA ranking): 3g latest edition, 3h previous editions

Collapse policy (group_rules step 2f / phase_1_corrections): the simulator does NOT
model cards, so the conduct step (2f) is SKIPPED and ties surviving past overall goals
scored are broken by the pre-tournament FIFA Ranking (3g, then 3h) -- FIFA's official
deterministic step. No drawing of lots (FIFA does not use it for 2026). FIFA ranks are
unique, so the chain always terminates.

Best-eight thirds (cross-group, NO head-to-head): points -> overall GD -> overall GS ->
[skip conduct] -> FIFA latest -> FIFA previous.

A match result is a tuple (team_a, team_b, score_a, score_b).
"""
from __future__ import annotations

WIN, DRAW = 3, 1


def overall_stats(teams: list[str], results: list[tuple]) -> dict[str, dict]:
    """points / goal-difference / goals-scored over the given matches, per team."""
    st = {t: {"pts": 0, "gf": 0, "ga": 0} for t in teams}
    tset = set(teams)
    for a, b, sa, sb in results:
        if a not in tset or b not in tset:
            continue
        st[a]["gf"] += sa; st[a]["ga"] += sb
        st[b]["gf"] += sb; st[b]["ga"] += sa
        if sa > sb:
            st[a]["pts"] += WIN
        elif sb > sa:
            st[b]["pts"] += WIN
        else:
            st[a]["pts"] += DRAW; st[b]["pts"] += DRAW
    for t in teams:
        st[t]["gd"] = st[t]["gf"] - st[t]["ga"]
        st[t]["gs"] = st[t]["gf"]
    return st


def _fifa_key(team: str, fifa_latest: dict, fifa_prev: list[dict]):
    # lower rank = better; latest first, then previous editions, then stable by name
    return (fifa_latest.get(team, 10**6),
            *[ed.get(team, 10**6) for ed in fifa_prev],
            team)


def _by_fifa(teams: list[str], fifa_latest: dict, fifa_prev: list[dict]) -> list[str]:
    return sorted(teams, key=lambda t: _fifa_key(t, fifa_latest, fifa_prev))


def _partition(teams: list[str], key) -> list[list[str]]:
    """Sort by key (descending tuples already negated by caller) then split into blocks
    of teams sharing the exact same key, preserving sorted order."""
    ordered = sorted(teams, key=key)
    blocks, cur, cur_key = [], [], object()
    for t in ordered:
        k = key(t)
        if k != cur_key:
            if cur:
                blocks.append(cur)
            cur, cur_key = [t], k
        else:
            cur.append(t)
    if cur:
        blocks.append(cur)
    return blocks


def _break_by_fifa(block, fifa_latest, fifa_prev):
    return _by_fifa(block, fifa_latest, fifa_prev)


def _break_by_overall(block, overall, fifa_latest, fifa_prev):
    """Step 2: overall GD then overall GS (no restart to head-to-head); remaining ties
    collapse to FIFA ranking (conduct step skipped)."""
    def key(t):
        s = overall[t]
        return (-s["gd"], -s["gs"])
    out = []
    for sub in _partition(block, key):
        if len(sub) == 1:
            out.append(sub[0])
        else:
            out.extend(_break_by_fifa(sub, fifa_latest, fifa_prev))
    return out


def _head_to_head_stats(block, results):
    """points/gd/gs restricted to matches BETWEEN teams in `block`."""
    return overall_stats(block, results)  # overall_stats already filters to the team set


def _break_block(block, results, overall, fifa_latest, fifa_prev):
    """Resolve a block of teams that are equal on points. Applies step 1 (head-to-head)
    with the FIFA re-apply rule, then step 2 (overall), then FIFA."""
    if len(block) == 1:
        return list(block)

    h2h = _head_to_head_stats(block, results)

    def h2h_key(t):
        s = h2h[t]
        return (-s["pts"], -s["gd"], -s["gs"])

    subs = _partition(block, h2h_key)

    if len(subs) == 1:
        # head-to-head separated nothing -> go to overall (step 2)
        return _break_by_overall(block, overall, fifa_latest, fifa_prev)

    # partial (or full) separation -> RE-APPLY step 1 to each still-tied subset only
    out = []
    for sub in subs:
        if len(sub) == 1:
            out.append(sub[0])
        else:
            out.extend(_break_block(sub, results, overall, fifa_latest, fifa_prev))
    return out


def rank_group(teams, results, fifa_latest, fifa_prev, overall=None):
    """Return the 4 teams ordered 1st..4th per FIFA Article 13.

    `overall` (precomputed overall_stats) may be passed to avoid recomputation.
    """
    if overall is None:
        overall = overall_stats(teams, results)
    # primary: points; tie blocks resolved by the chain
    out = []
    for block in _partition(teams, lambda t: (-overall[t]["pts"],)):
        if len(block) == 1:
            out.append(block[0])
        else:
            out.extend(_break_block(block, results, overall, fifa_latest, fifa_prev))
    return out


def rank_thirds(thirds, overall, fifa_latest, fifa_prev):
    """Rank the 12 third-placed teams (cross-group, no head-to-head): points -> GD ->
    GS -> [skip conduct] -> FIFA latest -> FIFA previous. Returns best-first."""
    def key(t):
        s = overall[t]
        return (-s["pts"], -s["gd"], -s["gs"], _fifa_key(t, fifa_latest, fifa_prev))
    return sorted(thirds, key=key)

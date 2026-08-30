"""Phase 4 Checkpoint 4C.4 -- projected group standings + qualification odds.

Reuses 4C.1a's accumulation: `_accumulate` already counts per-team group-finish positions
(1st/2nd/3rd) and best-eight-third qualification over the run's Monte Carlo, and
`projected_standings` gives the most-likely 1st→4th order (the same order the bracket's R32
occupants come from -- so groups and bracket agree by construction).

Adds the per-team PROBABILITIES the group table needs (only the argmax occupant was persisted in
4C.1a): P(1st)/P(2nd)/P(3rd)/P(4th), P(best-third), and the projected rank. P(win group)=P(1st),
P(top-2)=P(1st)+P(2nd), P(qualify)=P(top-2)+P(best-third) -- the last cross-checks against
`team_probabilities.advance_group`.
"""
from __future__ import annotations

from simulator.loaders import TournamentData
from simulator.projected_bracket import _accumulate, projected_standings


def build_group_projection(data: TournamentData, sampler, iters: int, seed: int) -> list[dict]:
    pos, _third_q, best_third = _accumulate(data, sampler, iters, seed)
    standings = projected_standings(data, pos)
    itf = float(iters)

    rows: list[dict] = []
    for g, seeds in data.groups.items():
        rank = {t: i + 1 for i, t in enumerate(standings[g])}
        for t in seeds:
            p1 = pos[g][1][t] / itf
            p2 = pos[g][2][t] / itf
            p3 = pos[g][3][t] / itf
            p4 = max(0.0, 1.0 - p1 - p2 - p3)
            rows.append({
                "group_code": g, "team": t,
                "p_first": p1, "p_second": p2, "p_third": p3, "p_fourth": p4,
                "p_best_third": best_third[t] / itf,
                "proj_rank": rank[t],
            })
    return rows

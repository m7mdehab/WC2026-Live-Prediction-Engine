"""Single-tournament resolution + Monte Carlo accumulation (Phase 2.6 shell)."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import tiebreakers as tb
from .loaders import TournamentData

STAGES = ["advance_group", "reach_r16", "reach_qf", "reach_sf", "reach_final", "champion"]


@dataclass
class SimResult:
    standings: dict[str, list[str]]     # group -> [1st..4th]
    qualified: list[str]                # 32 teams into R32
    reached_r16: list[str]
    reached_qf: list[str]
    reached_sf: list[str]
    reached_final: list[str]
    champion: str
    r32_pairings: list[tuple]           # (match_id, team_a, team_b) -- for QA


def assign_r32(data: TournamentData, standings, top8_third_groups):
    """Resolve the 16 R32 pairings from group standings + the Annex C combo for the
    given set of 8 qualifying third-placed groups."""
    combo = data.combo_lookup[tuple(sorted(top8_third_groups))]
    winner_of = {g: s[0] for g, s in standings.items()}
    runner_of = {g: s[1] for g, s in standings.items()}
    third_of = {g: s[2] for g, s in standings.items()}

    def resolve_slot(slot):
        kind, grp = slot[0], slot[1]
        if kind == "1":
            return winner_of[grp]
        if kind == "2":
            return runner_of[grp]
        if kind == "3":
            return third_of[grp]
        raise ValueError(slot)

    pairings = []
    for m in data.ko_matches:
        if m.stage != "round_of_32":
            continue
        a = resolve_slot(m.team_a_slot)
        if m.team_b_slot.startswith("best3:"):
            winner_slot = m.team_b_slot.split(":", 1)[1]   # e.g. "1E"
            third_grp = combo[winner_slot][1]              # "3F" -> "F"
            b = third_of[third_grp]
        else:
            b = resolve_slot(m.team_b_slot)
        pairings.append((m.match_id, a, b))
    return pairings


def simulate_once(data: TournamentData, sampler, rng) -> SimResult:
    # ---- group stage ----
    group_results = {g: [] for g in data.groups}
    for m in data.group_matches:
        sa, sb = sampler.group_score(m.match_id, m.team_a, m.team_b, rng)
        group_results[m.group].append((m.team_a, m.team_b, sa, sb))

    standings, overall_all = {}, {}
    for g, teams in data.groups.items():
        ov = tb.overall_stats(teams, group_results[g])
        overall_all.update(ov)
        standings[g] = tb.rank_group(teams, group_results[g], data.fifa_latest,
                                     data.fifa_prev, overall=ov)

    # ---- best-eight thirds ----
    thirds = [standings[g][2] for g in data.groups]
    ranked_thirds = tb.rank_thirds(thirds, overall_all, data.fifa_latest, data.fifa_prev)
    top8 = ranked_thirds[:8]
    top8_groups = [data.team_group[t] for t in top8]

    qualified = [standings[g][0] for g in data.groups] + \
                [standings[g][1] for g in data.groups] + top8

    # ---- R32 ----
    pairings = assign_r32(data, standings, top8_groups)
    win, lose = {}, {}
    for mid, a, b in pairings:
        w, l = sampler.knockout_winner(mid, a, b, rng)
        win[mid], lose[mid] = w, l
    reached_r16 = [win[mid] for mid, _, _ in pairings]

    # ---- R16 -> SF via W##/L## slot references ----
    def team_from_slot(slot):
        ref = slot[1:]            # 'W74' -> '74'
        return win[f"M{int(ref):03d}"] if slot[0] == "W" else lose[f"M{int(ref):03d}"]

    for m in data.ko_matches:
        if m.stage in ("round_of_32",):
            continue
        if m.stage == "third_place_playoff":
            a, b = lose["M101"], lose["M102"]
        elif m.match_id == "M104":
            a, b = win["M101"], win["M102"]
        else:
            a = team_from_slot(m.team_a_slot)
            b = team_from_slot(m.team_b_slot)
        w, l = sampler.knockout_winner(m.match_id, a, b, rng)
        win[m.match_id], lose[m.match_id] = w, l

    reached_qf = [win[f"M{n:03d}"] for n in range(89, 97)]   # R16 winners
    reached_sf = [win[f"M{n:03d}"] for n in range(97, 101)]  # QF winners
    reached_final = [win["M101"], win["M102"]]              # SF winners
    champion = win["M104"]

    return SimResult(standings, qualified, reached_r16, reached_qf,
                     reached_sf, reached_final, champion, pairings)


def monte_carlo(data: TournamentData, sampler, iters: int, seed: int):
    """Run `iters` tournaments; return per-team stage probabilities + raw counts."""
    rng = np.random.default_rng(seed)
    idx = {t: i for i, t in enumerate(data.all_teams)}
    n = len(data.all_teams)
    counts = {s: np.zeros(n, dtype=np.int64) for s in STAGES}

    for _ in range(iters):
        res = simulate_once(data, sampler, rng)
        for t in res.qualified:
            counts["advance_group"][idx[t]] += 1
        for t in res.reached_r16:
            counts["reach_r16"][idx[t]] += 1
        for t in res.reached_qf:
            counts["reach_qf"][idx[t]] += 1
        for t in res.reached_sf:
            counts["reach_sf"][idx[t]] += 1
        for t in res.reached_final:
            counts["reach_final"][idx[t]] += 1
        counts["champion"][idx[res.champion]] += 1

    probs = {t: {s: counts[s][idx[t]] / iters for s in STAGES} for t in data.all_teams}
    return probs, counts, idx

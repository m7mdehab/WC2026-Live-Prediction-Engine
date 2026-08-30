"""Phase 4 Checkpoint 4C.1a -- projected knockout bracket from the current run's sim outputs.

Construction method (FLAGGED -- see docs/phase_4_checkpoint_c1.md):
  - R32 occupants: per-group-position **argmax** over the Monte Carlo -- each group's most-likely
    winner / runner-up / third -- with the best-third SLOT assignment delegated to the real Annex C
    logic (`engine.assign_r32`) using the most-likely set of 8 qualifying third-place groups. By
    construction the 32 R32 occupants are 12 distinct winners + 12 distinct runners + 8 distinct
    thirds, so every team lands in exactly one slot; assign_r32 + Annex C guarantee no same-group
    R32 pairing.
  - Advancement R16 → Final: deterministic **per-match argmax** -- the projected winner is the side
    with the higher P(advance) = P(win) + P(draw)/2 (knockouts are decided, not drawn).
  - W/D/L + expected goals for every projected matchup come from the SAME Dixon-Coles match model
    used everywhere (real venue / altitude / host context via `match_id`) -- mirrors 4B.1.

This is the model's single most-likely arrangement, not a claim each game plays out this way.
"""
from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass, field

import numpy as np

from model.dixon_coles import score_matrix
from simulator.engine import assign_r32, simulate_once
from simulator.loaders import TournamentData
from simulator.model_sampler import MAX_GOALS

logger = logging.getLogger(__name__)


@dataclass
class BracketMatch:
    match_id: str
    match_no: int
    stage: str
    slot_a: str
    slot_b: str
    team_a: str
    team_b: str
    p_a: float
    p_draw: float
    p_b: float
    xg_a: float
    xg_b: float
    occ_a: float | None       # R32 only: projected-occupancy prob of team_a (group position)
    occ_b: float | None
    proj_winner: str
    a_resolved: bool = False   # this side's occupant is fixed by completed results (not projected)
    b_resolved: bool = False
    champion_path: bool = False


@dataclass
class ProjectedBracket:
    champion: str
    matches: list[BracketMatch]
    method: str = "per-group-position argmax → Annex C assign_r32 → per-match argmax advance"
    group_occupancy: dict = field(default_factory=dict)  # group -> {pos: (team, prob)}


def _accumulate(data: TournamentData, sampler, iters: int, seed: int):
    """Count group-finish positions and best-eight-third qualification over `iters` sims."""
    rng = np.random.default_rng(seed)
    pos = {g: {1: Counter(), 2: Counter(), 3: Counter()} for g in data.groups}
    third_q: Counter = Counter()     # group -> times its 3rd qualified among the best 8
    best_third: Counter = Counter()  # team -> times in the best-8 thirds
    for _ in range(iters):
        res = simulate_once(data, sampler, rng)
        qset = set(res.qualified)
        for g in data.groups:
            st = res.standings[g]
            pos[g][1][st[0]] += 1
            pos[g][2][st[1]] += 1
            pos[g][3][st[2]] += 1
            if st[2] in qset:
                third_q[g] += 1
                best_third[st[2]] += 1
    return pos, third_q, best_third


def projected_standings(data: TournamentData, pos) -> dict[str, list[str]]:
    """Most-likely finishing order per group (1st→4th) by per-position argmax, distinct within
    group. Shared by the bracket (4C.1a) and the groups page (4C.4) so they agree by construction.
    `pos[g][1|2|3]` are Counters of how often each team finished 1st/2nd/3rd over the sims."""
    standings: dict[str, list[str]] = {}
    for g, seeds in data.groups.items():
        winner = pos[g][1].most_common(1)[0][0]
        runner = next(t for t, _ in pos[g][2].most_common() if t != winner)
        third = next(t for t, _ in pos[g][3].most_common() if t not in (winner, runner))
        fourth = next(t for t in seeds if t not in (winner, runner, third))
        standings[g] = [winner, runner, third, fourth]
    return standings


def _wdl(sampler, mid: str, a: str, b: str):
    lam, mu = sampler._lam_mu(mid, a, b)
    mat = score_matrix(lam, mu, sampler.rho, MAX_GOALS)
    return (float(np.tril(mat, -1).sum()), float(np.trace(mat)), float(np.triu(mat, 1).sum()),
            float(lam), float(mu))


def build_projected_bracket(data: TournamentData, sampler, iters: int, seed: int,
                            known: dict | None = None,
                            force_champion: str | None = None) -> ProjectedBracket:
    """`known` is the recalc completed-results map (match_id -> (...)). When given, a bracket side
    is marked resolved if its occupant is fixed by completed results: a W##/L## slot whose feeder
    match is completed, a group-position slot (1X/2X/3X) whose group is fully played, or a best-third
    slot once the whole group stage is done; a completed match itself resolves both sides.

    `force_champion` (optional) makes the named team the projected winner of EVERY match it plays, so
    it advances down its (fixed, slot-determined) path and wins M104 -- i.e. the projected champion and
    gold path follow this team instead of the per-match argmax. Used by recalc to align the CURRENT
    bracket's champion with the title-odds leader (team_probabilities.champion). It changes ONLY the
    projected winner along the forced path (and the downstream occupants/loser identities that follow
    from it); every p_a/p_draw/p_b/xg stays the honest Dixon-Coles number for whatever pairing results.
    When None (the default and the cond0/Initial path), behaviour is byte-identical to pure argmax.
    Safety net: if `force_champion` never appears in the bracket (e.g. it was not a projected R32
    occupant), the force never fires, a warning is logged, and champion falls back to the argmax winner."""
    pos, third_q, best_third = _accumulate(data, sampler, iters, seed)
    itf = float(iters)
    known = known or {}
    # accumulation uses the (possibly conditioned) sampler; per-matchup W/D/L uses the base model's
    # λ/μ (a ConditionedSampler exposes the base as `.base`; a plain DixonColesSampler is its own base)
    wdl_sampler = getattr(sampler, "base", sampler)
    group_done = {
        g: all(gm.match_id in known for gm in data.group_matches if gm.group == g)
        for g in data.groups
    }
    all_groups_done = all(group_done.values()) if group_done else False

    def side_resolved(slot: str) -> bool:
        if slot.startswith("best3"):
            return all_groups_done
        c = slot[0]
        if c in ("W", "L"):
            return f"M{int(slot[1:]):03d}" in known
        if c in ("1", "2", "3"):
            return group_done.get(slot[1], False)
        return False

    # projected standings via the shared helper (the groups page reuses this same function, so the
    # projected group winners/runners are guaranteed to match the bracket's R32 occupants).
    standings = projected_standings(data, pos)
    winner_p, runner_p, third_p = {}, {}, {}
    for g in data.groups:
        w, r, th, _ = standings[g]
        winner_p[g] = pos[g][1][w] / itf
        runner_p[g] = pos[g][2][r] / itf
        third_p[g] = best_third[th] / itf  # the team's own best-third qualification prob

    # most-likely set of 8 qualifying third-place groups → Annex C combo (real assignment logic)
    top8_groups = [g for g, _ in third_q.most_common(8)]
    pairings = dict((mid, (a, b)) for mid, a, b in assign_r32(data, standings, top8_groups))

    # TRACK 1 (R32 seeding): once the group stage is mathematically complete, the R32 occupants are
    # FULLY DETERMINED (FIFA Article 13 + Annex C), not a Monte Carlo projection. Re-seed the 16 R32
    # ties from db.ko_readiness.resolve_r32 (the deterministic source of truth, dress-rehearsed
    # byte-identical to engine.simulate_once) so the published R32 team_a/team_b equal the ACTUAL
    # qualifiers. resolve_r32 is CALLED as-is (ko_readiness is untouchable). When the group stage is
    # NOT complete, `pairings` stays the per-group-position argmax (unchanged behaviour). The
    # resolved standings also override the projected ones used for the per-position occupancy %, so a
    # resolved R32 side reports occupancy 1.0 (it is the actual occupant, not a probability).
    r32_resolved = False
    if all_groups_done:
        from db.ko_readiness import resolve_r32
        rr = resolve_r32(data, known)
        if rr.ready and rr.pairings is not None and rr.standings is not None:
            pairings = dict((mid, (a, b)) for mid, a, b in rr.pairings)
            standings = rr.standings
            r32_resolved = True

    def occ_of(t: str) -> float | None:
        # When the group stage is complete the R32 occupants are deterministic: the resolved
        # qualifier sits in its slot with certainty, so its occupancy is 1.0 (not a sampled prob).
        if r32_resolved:
            return 1.0
        g = data.team_group[t]
        st = standings[g]
        if t == st[0]:
            return winner_p[g]
        if t == st[1]:
            return runner_p[g]
        if t == st[2]:
            return third_p[g]
        return None

    win: dict[str, str] = {}
    lose: dict[str, str] = {}
    records: dict[str, BracketMatch] = {}
    forced_fired = False  # did force_champion ever appear as a participant (so the force took effect)?

    def team_from_slot(slot: str) -> str:
        key = f"M{int(slot[1:]):03d}"
        return win[key] if slot[0] == "W" else lose[key]

    for m in data.ko_matches:  # already in match-number order M073..M104
        if m.stage == "round_of_32":
            a, b = pairings[m.match_id]
        elif m.stage == "third_place_playoff":
            a, b = lose["M101"], lose["M102"]
        elif m.match_id == "M104":
            a, b = win["M101"], win["M102"]
        else:
            a, b = team_from_slot(m.team_a_slot), team_from_slot(m.team_b_slot)

        p_a, p_d, p_b, la, mu = _wdl(wdl_sampler, m.match_id, a, b)
        # TRACK 1 (progressive per-SIDE fill): a KO match whose ACTUAL winner is recorded in `known`
        # (("ko", winner_team)) advances that real winner -- the moment a feeder is decided its
        # downstream side fills with the actual team NOW (team_from_slot reads win/lose below),
        # independent of the rest of the round; the opposing side stays projected until its own feeder
        # is decided. KO winners are admin-entered (manual), never auto-advanced here -- this only
        # READS a recorded winner. force_champion (if a participant) is the projected winner; else the
        # per-match argmax P(advance) = p_a + p_draw/2 >= 0.5 decides. p_a/p_draw/p_b/xg are untouched.
        ko_entry = known.get(m.match_id)
        if ko_entry is not None and ko_entry[0] == "ko" and ko_entry[1] in (a, b):
            actual = ko_entry[1]
            w, l = (actual, b if actual == a else a)
            if force_champion is not None and force_champion == actual:
                forced_fired = True
        elif force_champion is not None and force_champion in (a, b):
            w, l = (force_champion, b if force_champion == a else a)
            forced_fired = True
        else:
            w, l = (a, b) if (p_a + p_d / 2.0) >= 0.5 else (b, a)
        win[m.match_id], lose[m.match_id] = w, l
        played = m.match_id in known
        records[m.match_id] = BracketMatch(
            match_id=m.match_id, match_no=int(m.match_id[1:]), stage=m.stage,
            slot_a=m.team_a_slot, slot_b=m.team_b_slot, team_a=a, team_b=b,
            p_a=p_a, p_draw=p_d, p_b=p_b, xg_a=la, xg_b=mu,
            occ_a=(occ_of(a) if m.stage == "round_of_32" else None),
            occ_b=(occ_of(b) if m.stage == "round_of_32" else None),
            proj_winner=w,
            a_resolved=played or side_resolved(m.team_a_slot),
            b_resolved=played or side_resolved(m.team_b_slot),
        )

    champion = win["M104"]
    if force_champion is not None and not forced_fired:
        # the requested champion never occupied a bracket slot (e.g. not a projected R32 qualifier):
        # the force could not fire, so the champion falls back to the per-match argmax winner.
        logger.warning(
            "force_champion=%r is not a participant in the projected bracket; falling back to the "
            "argmax champion %r", force_champion, champion)
    for rec in records.values():
        if champion in (rec.team_a, rec.team_b):
            rec.champion_path = True

    group_occupancy = {
        g: {1: (standings[g][0], winner_p[g]), 2: (standings[g][1], runner_p[g]),
            3: (standings[g][2], third_p[g])}
        for g in data.groups
    }
    return ProjectedBracket(champion=champion,
                            matches=[records[m.match_id] for m in data.ko_matches],
                            group_occupancy=group_occupancy)


def main() -> None:
    """Quick local smoke print (no DB)."""
    from simulator.loaders import load
    from simulator.model_sampler import DixonColesSampler
    data = load()
    sampler = DixonColesSampler()
    pb = build_projected_bracket(data, sampler, iters=8000, seed=42)
    print(f"method: {pb.method}")
    print(f"projected champion: {pb.champion}")
    by_stage: dict[str, list[BracketMatch]] = {}
    for m in pb.matches:
        by_stage.setdefault(m.stage, []).append(m)
    for stage, ms in by_stage.items():
        print(f"\n== {stage} ==")
        for m in ms:
            star = " ★path" if m.champion_path else ""
            print(f"  {m.match_id} {m.team_a} vs {m.team_b}  "
                  f"({m.p_a*100:.0f}/{m.p_draw*100:.0f}/{m.p_b*100:.0f}) -> {m.proj_winner}{star}")


if __name__ == "__main__":
    main()

"""Phase 3 Checkpoint B -- condition the Monte Carlo on real results.

ConditionedSampler wraps the base DixonColesSampler and returns KNOWN outcomes
deterministically; for unplayed matches it delegates to the base sampler. The engine is
unchanged -- it just gets a sampler that happens to know some results, so completed group
scorelines feed the Article-13 tie-breakers (GD/GS) and completed knockouts name the
advancing team.

`known` maps match_id ->
    ("group", score_a, score_b)   # score_a/score_b for the fixture's team_a/team_b
    ("ko", winner_team)           # winner_team must be one of the two participants

RecordingSampler captures every outcome the base sampler produces in one simulation -- used
by tests to synthesise a self-consistent full tournament to condition on.
"""
from __future__ import annotations

from collections import defaultdict


class ConditionedSampler:
    def __init__(self, base, known: dict, record_ko_participants: bool = False):
        self.base = base
        self.known = known
        self.record = record_ko_participants
        self.inconsistencies: list[tuple] = []      # KO results whose winner wasn't a participant
        self.ko_participants: dict[str, set] = defaultdict(set)  # match_id -> {(a,b), ...}

    def group_score(self, match_id, a, b, rng):
        k = self.known.get(match_id)
        if k is not None and k[0] == "group":
            return k[1], k[2]                         # deterministic known scoreline
        return self.base.group_score(match_id, a, b, rng)

    def knockout_winner(self, match_id, a, b, rng):
        if self.record:
            self.ko_participants[match_id].add((a, b))
        k = self.known.get(match_id)
        if k is not None and k[0] == "ko":
            w = k[1]
            if w == a:
                return a, b
            if w == b:
                return b, a
            # known winner isn't one of the resolved participants -> inconsistent prefix
            self.inconsistencies.append((match_id, w, a, b))
            return self.base.knockout_winner(match_id, a, b, rng)
        return self.base.knockout_winner(match_id, a, b, rng)


class RecordingSampler:
    """Delegates to base and records each match's realised outcome (one full tournament)."""
    def __init__(self, base):
        self.base = base
        self.group: dict[str, tuple[int, int]] = {}
        self.ko: dict[str, str] = {}

    def group_score(self, match_id, a, b, rng):
        sa, sb = self.base.group_score(match_id, a, b, rng)
        self.group[match_id] = (sa, sb)
        return sa, sb

    def knockout_winner(self, match_id, a, b, rng):
        w, l = self.base.knockout_winner(match_id, a, b, rng)
        self.ko[match_id] = w
        return w, l

    def known_map(self) -> dict:
        """The recorded tournament as a ConditionedSampler `known` map (all 104 matches)."""
        out = {mid: ("group", sa, sb) for mid, (sa, sb) in self.group.items()}
        out.update({mid: ("ko", w) for mid, w in self.ko.items()})
        return out

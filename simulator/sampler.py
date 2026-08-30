"""Placeholder match samplers for the Phase 2.6 shell.

A sampler turns a match into outcomes the engine consumes:
  - group_score(match_id, a, b, rng) -> (score_a, score_b)
  - knockout_winner(match_id, a, b, rng) -> (winner, loser)

The engine depends ONLY on this interface. When the real Dixon-Coles model lands it
implements the same interface (sampling scorelines from the fitted bivariate-Poisson),
and nothing else in the engine changes -- that decoupling is the point of the shell.

PLACEHOLDER GOAL MODEL (flagged): group standings need goal difference / goals scored,
but the placeholder inputs are W/D/L probability triples. So after sampling an outcome
from the triple we synthesise a plausible scoreline from small Poissons consistent with
that outcome. This goal model is a stand-in ONLY; the real model emits scorelines
directly and this code path is replaced.

KNOCKOUT COLLAPSE (per PM): draw probability is folded 50/50 into the two sides
(p_draw counts as "decided in extra time / penalties"), then a single winner is sampled.
"""
from __future__ import annotations

import numpy as np

UNIFORM = (1 / 3, 1 / 3, 1 / 3)


class MatchSampler:
    """Base sampler. Subclasses provide `triple(match_id, a, b) -> (pa, pd, pb)`."""

    # --- placeholder goal model (group stage) ---
    def _scoreline(self, outcome: str, rng: np.random.Generator) -> tuple[int, int]:
        if outcome == "D":
            g = int(rng.poisson(1.1))
            return g, g
        win = 1 + int(rng.poisson(1.0))
        lose = int(rng.poisson(0.7))
        if lose >= win:
            lose = win - 1
        return (win, lose) if outcome == "A" else (lose, win)

    def _outcome(self, pa: float, pd: float, pb: float, rng: np.random.Generator) -> str:
        u = rng.random() * (pa + pd + pb)
        if u < pa:
            return "A"
        if u < pa + pd:
            return "D"
        return "B"

    def triple(self, match_id, a, b):
        raise NotImplementedError

    def group_score(self, match_id, a, b, rng):
        pa, pd, pb = self.triple(match_id, a, b)
        return self._scoreline(self._outcome(pa, pd, pb, rng), rng)

    def knockout_winner(self, match_id, a, b, rng):
        pa, pd, pb = self.triple(match_id, a, b)
        # fold the draw 50/50; sample a single winner
        wa = pa + pd / 2.0
        total = wa + (pb + pd / 2.0)
        return (a, b) if rng.random() * total < wa else (b, a)


class UniformSampler(MatchSampler):
    """Every match is 1/3 - 1/3 - 1/3."""
    def triple(self, match_id, a, b):
        return UNIFORM


class RandomTripleSampler(MatchSampler):
    """A fixed-but-arbitrary triple per match (deterministic given the seed), so different
    matches have different probabilities -- useful for a realistic-looking shell run."""
    def __init__(self, seed: int):
        self._cache: dict[str, tuple] = {}
        self._seed = seed

    def triple(self, match_id, a, b):
        t = self._cache.get(match_id)
        if t is None:
            # derive a stable Dirichlet draw from (seed, match_id)
            r = np.random.default_rng(abs(hash((self._seed, match_id))) % (2**32))
            t = tuple(r.dirichlet([2.0, 1.5, 2.0]))
            self._cache[match_id] = t
        return t


class CustomSampler(MatchSampler):
    """Explicit triples per match_id (default uniform). For tests and, later, feeding the
    real model's per-match W/D/L if ever needed. Triples may be keyed by match_id OR by an
    unordered frozenset({a,b}) pair so forced scenarios survive bracket re-seeding."""
    def __init__(self, triples: dict | None = None, default=UNIFORM,
                 pair_triples: dict | None = None):
        self._by_id = triples or {}
        self._by_pair = pair_triples or {}
        self._default = default

    def triple(self, match_id, a, b):
        if match_id in self._by_id:
            return self._by_id[match_id]
        key = frozenset((a, b))
        if key in self._by_pair:
            return self._by_pair[key]
        return self._default

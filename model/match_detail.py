"""Phase 4 Checkpoint 4C.3 -- per-match extras: most-likely scorelines + head-to-head.

- top_scorelines: the highest-probability exact scores from the Dixon-Coles corrected score matrix
  (the same matrix the W/D/L comes from -- mostly surfacing what's already computed).
- head_to_head: historical meetings between the two sides from historical_results_clean.csv
  (overall record from team_a's perspective + the most-recent meetings).
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from model.dixon_coles import score_matrix
from simulator.model_sampler import MAX_GOALS

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def top_scorelines(sampler, match_id: str, a: str, b: str, k: int = 6) -> list[dict]:
    """Top-k most-likely exact scorelines (a-b) with probabilities, from the DC score matrix."""
    lam, mu = sampler._lam_mu(match_id, a, b)
    mat = score_matrix(lam, mu, sampler.rho, MAX_GOALS)
    cells = [(float(mat[i, j]), i, j) for i in range(mat.shape[0]) for j in range(mat.shape[1])]
    cells.sort(reverse=True)
    out = []
    for p, i, j in cells[:k]:
        out.append({
            "score": f"{i}-{j}", "ga": i, "gb": j, "p": round(p, 4),
            "result": "a" if i > j else ("b" if j > i else "draw"),
        })
    return out


def load_hist() -> pd.DataFrame:
    return pd.read_csv(DATA / "historical_results_clean.csv")


def head_to_head(hist: pd.DataFrame, a: str, b: str, recent: int = 5) -> dict:
    """Historical record between a and b (a's perspective) + the most-recent meetings."""
    mask = (((hist.home_team_canon == a) & (hist.away_team_canon == b)) |
            ((hist.home_team_canon == b) & (hist.away_team_canon == a)))
    m = hist[mask].sort_values("date")
    a_w = d = b_w = ga = gb = 0
    for r in m.itertuples(index=False):
        home_is_a = r.home_team_canon == a
        sa, sb = (r.home_score, r.away_score) if home_is_a else (r.away_score, r.home_score)
        ga += int(sa); gb += int(sb)
        if sa > sb: a_w += 1
        elif sa < sb: b_w += 1
        else: d += 1
    recents = []
    for r in list(m.tail(recent).itertuples(index=False))[::-1]:  # most-recent first
        home_is_a = r.home_team_canon == a
        sa, sb = (r.home_score, r.away_score) if home_is_a else (r.away_score, r.home_score)
        recents.append({
            "date": r.date, "competition": r.competition_category,
            "a_score": int(sa), "b_score": int(sb),
            "neutral": bool(r.neutral),
            "winner": a if sa > sb else (b if sb > sa else None),
        })
    return {
        "played": int(len(m)), "a_wins": a_w, "draws": d, "b_wins": b_w,
        "goals_a": ga, "goals_b": gb, "recent": recents,
    }

"""Phase 2.4 metrics -- multiclass Brier, log loss, reliability.

Classes are ordered [home_win, draw, away_win] = [0, 1, 2] throughout.
P is an (N, 3) array of predicted probabilities; Y is an (N,) array of class indices.
"""
from __future__ import annotations

import numpy as np

CLASSES = ["home_win", "draw", "away_win"]
EPS = 1e-6


def outcome(home_score: int, away_score: int) -> int:
    if home_score > away_score:
        return 0
    if home_score == away_score:
        return 1
    return 2


def multiclass_brier(P: np.ndarray, Y: np.ndarray) -> float:
    """Mean over matches of Σ_c (p_c − y_c)^2 (y one-hot). Range [0, 2]."""
    onehot = np.zeros_like(P)
    onehot[np.arange(len(Y)), Y] = 1.0
    return float(np.mean(np.sum((P - onehot) ** 2, axis=1)))


def log_loss(P: np.ndarray, Y: np.ndarray) -> float:
    """Mean −log p(actual), clipped to [EPS, 1−EPS]."""
    p_actual = P[np.arange(len(Y)), Y]
    return float(np.mean(-np.log(np.clip(p_actual, EPS, 1 - EPS))))


def reliability_bins(p_class: np.ndarray, hit: np.ndarray, n_bins: int = 10):
    """For one class: bin predicted prob into n_bins equal-width [0,1] bins; per bin return
    count, mean predicted prob, observed frequency of `hit` (1 if actual==class)."""
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    idx = np.clip(np.digitize(p_class, edges) - 1, 0, n_bins - 1)
    rows = []
    for b in range(n_bins):
        m = idx == b
        n = int(m.sum())
        rows.append({
            "bin_low": round(edges[b], 2), "bin_high": round(edges[b + 1], 2),
            "n": n,
            "mean_pred": float(p_class[m].mean()) if n else None,
            "obs_freq": float(hit[m].mean()) if n else None,
        })
    return rows


def reliability_table(P: np.ndarray, Y: np.ndarray, n_bins: int = 10) -> dict:
    """Per-class reliability bin tables."""
    out = {}
    for c, name in enumerate(CLASSES):
        hit = (Y == c).astype(float)
        out[name] = reliability_bins(P[:, c], hit, n_bins)
    return out


def max_calibration_error(rel: dict) -> float:
    """Max |mean_pred − obs_freq| over all populated bins, all classes."""
    worst = 0.0
    for rows in rel.values():
        for r in rows:
            if r["n"] and r["mean_pred"] is not None:
                worst = max(worst, abs(r["mean_pred"] - r["obs_freq"]))
    return worst


def top_n_hit_rate(P: np.ndarray, Y: np.ndarray, n: int) -> float:
    """Fraction of matches where the actual class is among the model's top-n most probable
    classes. n=1 is plain accuracy; n=2 (of 3 classes) means "not the least-likely class".
    Ties are broken by class order via argsort (deterministic, stable enough for this use)."""
    if len(Y) == 0:
        return 0.0
    # indices of the top-n probabilities per row (descending). argsort is ascending, take last n.
    order = np.argsort(P, axis=1, kind="stable")
    topn = order[:, -n:]
    hits = (topn == Y[:, None]).any(axis=1)
    return float(np.mean(hits))


def mae_onehot(P: np.ndarray, Y: np.ndarray) -> float:
    """Mean absolute error between predicted class probabilities and the one-hot actual
    outcome, averaged over BOTH matches and the 3 classes (i.e. mean over all N*3 entries)."""
    onehot = np.zeros_like(P)
    onehot[np.arange(len(Y)), Y] = 1.0
    return float(np.mean(np.abs(P - onehot)))


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    """Spearman rank correlation coefficient with average-rank tie handling. Computed as the
    Pearson correlation of the rank vectors. Returns 0.0 when either rank vector is constant
    (undefined correlation), which keeps the metric deterministic and finite."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    if len(a) < 2:
        return 0.0
    ra, rb = _avg_rank(a), _avg_rank(b)
    sa, sb = ra.std(), rb.std()
    if sa < 1e-12 or sb < 1e-12:
        return 0.0
    return float(np.mean((ra - ra.mean()) * (rb - rb.mean())) / (sa * sb))


def _avg_rank(x: np.ndarray) -> np.ndarray:
    """Average ranks (1-based), ties share the mean of their positions. Deterministic."""
    order = np.argsort(x, kind="stable")
    ranks = np.empty(len(x), dtype=float)
    ranks[order] = np.arange(1, len(x) + 1, dtype=float)
    # average tied groups
    _, inv, counts = np.unique(x, return_inverse=True, return_counts=True)
    sums = np.zeros(len(counts))
    np.add.at(sums, inv, ranks)
    avg = sums / counts
    return avg[inv]


def all_metrics(P: np.ndarray, Y: np.ndarray, n_bins: int = 10) -> dict:
    rel = reliability_table(P, Y, n_bins)
    return {
        "brier": multiclass_brier(P, Y),
        "log_loss": log_loss(P, Y),
        "reliability": rel,
        "max_calibration_error": max_calibration_error(rel),
        "n": int(len(Y)),
    }

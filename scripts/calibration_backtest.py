#!/usr/bin/env python3
"""Phase 3a -- WC2026 full-tournament calibration backtest.

Reads the IMMUTABLE run-snapshot history from Supabase (anon, RLS-gated, read-only) and scores the
model's stored pre-match probabilities against the recorded results. Nothing is imputed: a match with
no clean pre-match run is OMITTED (with a reason), never guessed.

Two honestly-labelled analyses are produced:

  (A) FROZEN pre-tournament -- the cond0 run (the EARLIEST model_prediction_runs row with
      conditioned_on_results == 0; immutable / hijack-proof), scored on the 72 GROUP matches only.
      cond0 carries NULL knockout probabilities (KO teams are unknown pre-tournament), so KO is out of
      scope for (A) by construction.

  (B) LIVE walk-forward -- for each completed match, the MOST RECENT run created strictly BEFORE the
      match kickoff that carries a NON-NULL probability row for that match. 72 group matches are the
      clean headline; up to 32 knockout matches are a caveated secondary. Knockout orientation is
      asserted per row (winner_team must be exactly team_a or team_b, both resolved) and the row is
      OMITTED if it cannot be proven. A knockout tie decided on penalties is scored on the REGULATION
      score (home_score vs away_score => a draw); the shootout winner is never used to re-label the
      outcome. B_all (group + knockout, regulation-scored) is the full-tournament curve that mirrors the
      existing reliability_2018.csv / reliability_2022.csv (both all-matches) and is what the 2026 CSV
      reflects.

Orientation is guaranteed by match_id: match_results.home_score is ALWAYS team_a's score, so no
name-matching is needed to map (home_score, away_score) -> outcome. The per-row winner_team check for
knockout is an additional cross-proof, not the orientation source.

Pagination: match_probabilities is ~90k rows (870 runs x 104 matches); every table read is routed
through db.paginate.paged_rows so nothing is silently truncated at PostgREST's 1000-row cap.

The pure core `compute_calibration(P, Y)` is a deterministic function of the DB snapshot (no RNG, no
clock) and is unit-tested creds-free in tests/test_calibration_backtest.py. Only main() touches the DB
and the clock (the generated_at stamp is passed IN, never read inside the pure core).
"""
from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from model import metrics as M  # noqa: E402  pure, creds-free

CLASSES = M.CLASSES  # ["home_win", "draw", "away_win"] == team_a win / draw / team_b win
UNIFORM = [1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0]


# ============================================================ pure core (tested, no DB / no clock)
def _const_brier(p_const: list[float], Y: np.ndarray) -> float | None:
    if len(Y) == 0:
        return None
    P = np.tile(np.asarray(p_const, dtype=float), (len(Y), 1))
    return M.multiclass_brier(P, Y)


def _const_log_loss(p_const: list[float], Y: np.ndarray) -> float | None:
    if len(Y) == 0:
        return None
    P = np.tile(np.asarray(p_const, dtype=float), (len(Y), 1))
    return M.log_loss(P, Y)


def _skill(brier_model: float, brier_ref: float | None) -> float | None:
    """Brier skill score vs a reference baseline: 1 - brier_model/brier_ref. Higher is better; 0 means
    no better than the baseline; negative means worse. None when the reference is undefined/zero."""
    if brier_ref is None or brier_ref == 0.0:
        return None
    return 1.0 - brier_model / brier_ref


def compute_calibration(P: np.ndarray, Y: np.ndarray, n_bins: int = 10) -> dict:
    """Full calibration report for predicted probabilities P (N,3) vs actual class indices Y (N,).

    Classes are [team_a win, draw, team_b win] = [0, 1, 2]. Returns Brier, log loss, top-1/top-2 hit
    rate, per-class reliability bins, max calibration error, the empirical base-rate marginals, and two
    stored-data baselines (uniform and base-rate) each with its Brier, log loss and Brier skill score.
    Deterministic: no RNG, no clock. base_rate is derived FROM Y, so the whole report is a pure
    function of (P, Y)."""
    P = np.asarray(P, dtype=float)
    Y = np.asarray(Y, dtype=int)
    n = int(len(Y))

    rel = M.reliability_table(P, Y, n_bins)
    brier = M.multiclass_brier(P, Y) if n else None
    log_loss = M.log_loss(P, Y) if n else None
    top1 = M.top_n_hit_rate(P, Y, 1)
    top2 = M.top_n_hit_rate(P, Y, 2)
    mce = M.max_calibration_error(rel)

    # base-rate / climatology baseline = empirical marginal outcome frequencies from the stored Y.
    if n:
        base = [float((Y == 0).mean()), float((Y == 1).mean()), float((Y == 2).mean())]
    else:
        base = list(UNIFORM)

    b_uniform = _const_brier(UNIFORM, Y)
    b_base = _const_brier(base, Y)

    return {
        "n": n,
        "brier": brier,
        "log_loss": log_loss,
        "top1": top1,
        "top2": top2,
        "max_calibration_error": mce,
        "reliability": rel,
        "base_rate": base,
        "baselines": {
            "uniform": {
                "p": list(UNIFORM),
                "brier": b_uniform,
                "log_loss": _const_log_loss(UNIFORM, Y),
                "brier_skill_score": _skill(brier, b_uniform) if brier is not None else None,
            },
            "base_rate": {
                "p": base,
                "brier": b_base,
                "log_loss": _const_log_loss(base, Y),
                "brier_skill_score": _skill(brier, b_base) if brier is not None else None,
            },
        },
    }


# ============================================================ DB shell (main only)
def _parse_dt(s: str) -> datetime:
    """ISO-8601 with an explicit offset (all rows carry +00:00). Normalised to UTC for comparison."""
    return datetime.fromisoformat(s).astimezone(timezone.utc)


def _load_snapshot() -> dict:
    """Read the four tables via the anon client, fully paginated. Read-only."""
    from db.client import anon_client
    from db.paginate import paged_rows

    c = anon_client()
    runs = paged_rows(
        lambda: c.table("model_prediction_runs").select(
            "run_id,created_at,conditioned_on_results"),
        "run_id",
    )
    fixtures = paged_rows(
        lambda: c.table("fixtures").select("match_id,kickoff_utc,stage,team_a,team_b"),
        "match_id",
    )
    results = paged_rows(
        lambda: c.table("match_results").select(
            "match_id,home_score,away_score,winner_team,status,pen_home_score,pen_away_score"),
        "match_id",
    )
    probs = paged_rows(
        lambda: c.table("match_probabilities").select(
            "run_id,match_id,p_team_a_win,p_draw,p_team_b_win"),
        ["run_id", "match_id"],  # composite PK -> stable total order across pages
    )
    return {"runs": runs, "fixtures": fixtures, "results": results, "probs": probs}


def _build_pairs(snap: dict) -> dict:
    """Turn the raw snapshot into (P, Y) for analyses A and B, plus coverage/omission bookkeeping."""
    runs, fixtures, results, probs = snap["runs"], snap["fixtures"], snap["results"], snap["probs"]

    run_created = {r["run_id"]: _parse_dt(r["created_at"]) for r in runs}
    fx = {f["match_id"]: f for f in fixtures}
    res = {r["match_id"]: r for r in results}

    # cond0 = EARLIEST run with conditioned_on_results == 0 (immutable / hijack-proof).
    cond0_cand = sorted(
        (r for r in runs if r.get("conditioned_on_results") == 0),
        key=lambda r: _parse_dt(r["created_at"]),
    )
    cond0_run = cond0_cand[0]["run_id"] if cond0_cand else None

    # index probabilities: exact (run,match) lookup + per-match time series of NON-NULL predictions.
    prob_at = {}                       # (run_id, match_id) -> (pa, pd, pb) | None
    series = defaultdict(list)         # match_id -> [(created_at, run_id, (pa,pd,pb))] non-null only
    for row in probs:
        pa, pd_, pb = row["p_team_a_win"], row["p_draw"], row["p_team_b_win"]
        val = None if (pa is None or pd_ is None or pb is None) else (float(pa), float(pd_), float(pb))
        prob_at[(row["run_id"], row["match_id"])] = val
        ca = run_created.get(row["run_id"])
        if val is not None and ca is not None:
            series[row["match_id"]].append((ca, row["run_id"], val))

    group_ids = sorted(m for m, f in fx.items() if f["stage"] == "group")
    ko_ids = sorted(m for m, f in fx.items() if f["stage"] != "group")

    def result_ready(mid: str) -> bool:
        r = res.get(mid)
        return bool(r) and r.get("status") == "completed" \
            and r.get("home_score") is not None and r.get("away_score") is not None

    def outcome_of(mid: str) -> int:
        r = res[mid]
        return M.outcome(int(r["home_score"]), int(r["away_score"]))  # home_score == team_a's score

    def ko_orientation(mid: str) -> tuple[bool, str]:
        """Prove per-row orientation for a knockout match: both teams resolved AND winner_team is
        exactly team_a or team_b (a penalty winner still names one of the two participants)."""
        r, f = res[mid], fx[mid]
        ta, tb = f.get("team_a"), f.get("team_b")
        if not ta or not tb:
            return False, "team_a/team_b unresolved"
        w = r.get("winner_team")
        if w not in (ta, tb):
            return False, f"winner_team {w!r} not in {{{ta!r}, {tb!r}}}"
        return True, ""

    def latest_pre_kick(mid: str):
        """The most recent run created strictly before kickoff with a non-null prob for this match."""
        kick = _parse_dt(fx[mid]["kickoff_utc"])
        cand = [t for t in series.get(mid, []) if t[0] < kick]
        if not cand:
            return None
        return max(cand, key=lambda t: t[0])  # (created_at, run_id, probs)

    omitted: list[dict] = []

    # ---- (A) frozen cond0, group only
    A_P, A_Y, A_cov = [], [], []
    for mid in group_ids:
        if cond0_run is None:
            omitted.append({"analysis": "A", "match_id": mid, "reason": "no cond0 run found"})
            continue
        if not result_ready(mid):
            omitted.append({"analysis": "A", "match_id": mid, "reason": "no completed result"})
            continue
        val = prob_at.get((cond0_run, mid))
        if val is None:
            omitted.append({"analysis": "A", "match_id": mid,
                            "reason": "cond0 run has null/absent probability"})
            continue
        A_P.append(val); A_Y.append(outcome_of(mid)); A_cov.append(mid)

    # ---- (B) live walk-forward
    def build_B(ids: Iterable[str], require_orientation: bool, tag: str):
        Ps, Ys, cov, run_ids = [], [], [], set()
        for mid in ids:
            if not result_ready(mid):
                omitted.append({"analysis": tag, "match_id": mid, "reason": "no completed result"})
                continue
            if require_orientation:
                ok, why = ko_orientation(mid)
                if not ok:
                    omitted.append({"analysis": tag, "match_id": mid,
                                    "reason": f"KO orientation unproven: {why}"})
                    continue
            pk = latest_pre_kick(mid)
            if pk is None:
                omitted.append({"analysis": tag, "match_id": mid,
                                "reason": "no pre-kickoff run with non-null probabilities"})
                continue
            _, rid, val = pk
            Ps.append(val); Ys.append(outcome_of(mid)); cov.append(mid); run_ids.add(rid)
        return Ps, Ys, cov, sorted(run_ids)

    Bg_P, Bg_Y, Bg_cov, Bg_runs = build_B(group_ids, False, "B_group")
    Bk_P, Bk_Y, Bk_cov, Bk_runs = build_B(ko_ids, True, "B_ko")

    return {
        "cond0_run": cond0_run,
        "A": (np.array(A_P, dtype=float), np.array(A_Y, dtype=int), A_cov, [cond0_run] if cond0_run else []),
        "B_group": (np.array(Bg_P, dtype=float), np.array(Bg_Y, dtype=int), Bg_cov, Bg_runs),
        "B_ko": (np.array(Bk_P, dtype=float), np.array(Bk_Y, dtype=int), Bk_cov, Bk_runs),
        "B_all": (
            np.array(Bg_P + Bk_P, dtype=float),
            np.array(Bg_Y + Bk_Y, dtype=int),
            Bg_cov + Bk_cov,
            sorted(set(Bg_runs) | set(Bk_runs)),
        ),
        "omitted": omitted,
        "totals": {"group": len(group_ids), "ko": len(ko_ids)},
        "n_probs_rows": len(probs),
        "n_runs": len(runs),
        "n_fixtures": len(fixtures),
    }


def _analysis_block(P: np.ndarray, Y: np.ndarray, coverage: list[str], run_ids: list[str]) -> dict:
    block = compute_calibration(P, Y)
    block["coverage"] = coverage
    block["n_covered"] = len(coverage)
    block["run_ids"] = run_ids
    return block


def _write_reliability_csv(path: Path, year: int, reliability: dict) -> None:
    """Mirror the existing reliability_2018.csv / reliability_2022.csv schema exactly:
    year,class,bin_low,bin_high,n,mean_pred,obs_freq  (empty mean_pred/obs_freq for empty bins)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["year", "class", "bin_low", "bin_high", "n", "mean_pred", "obs_freq"])
        for cls in CLASSES:
            for b in reliability[cls]:
                w.writerow([
                    year, cls,
                    f"{b['bin_low']:.1f}", f"{b['bin_high']:.1f}", b["n"],
                    "" if b["mean_pred"] is None else b["mean_pred"],
                    "" if b["obs_freq"] is None else b["obs_freq"],
                ])


def main() -> None:
    generated_at = datetime.now(timezone.utc).isoformat()  # stamp passed IN; never read in the core

    snap = _load_snapshot()
    built = _build_pairs(snap)

    analyses = {
        "A_frozen_cond0_group": _analysis_block(*built["A"]),
        "B_live_walkforward_group": _analysis_block(*built["B_group"]),
        "B_live_walkforward_ko": _analysis_block(*built["B_ko"]),
        "B_live_walkforward_all": _analysis_block(*built["B_all"]),
    }

    tot = built["totals"]
    report = {
        "generated_at": generated_at,
        "description": "WC2026 full-tournament calibration backtest (Phase 3a). All numbers computed "
                       "from the stored run snapshot; matches without a clean pre-match run are omitted, "
                       "never imputed.",
        "source": {
            "cond0_run_id": built["cond0_run"],
            "n_runs": built["n_runs"],
            "n_match_probabilities_rows": built["n_probs_rows"],
            "n_fixtures": built["n_fixtures"],
            "orientation": "match_results.home_score is team_a's score (fixed by match_id); KO rows "
                           "additionally require winner_team in {team_a, team_b}.",
            "ko_penalty_rule": "regulation score (home_score vs away_score); a shootout tie scores as a "
                               "draw, shootout winner never re-labels the outcome.",
            "join": "match -> latest model_prediction_runs.created_at < fixtures.kickoff_utc with a "
                    "non-null match_probabilities row (B); cond0 run for A.",
        },
        "coverage_summary": {
            "group_total": tot["group"],
            "group_covered_A": analyses["A_frozen_cond0_group"]["n_covered"],
            "group_covered_B": analyses["B_live_walkforward_group"]["n_covered"],
            "ko_total": tot["ko"],
            "ko_covered_B": analyses["B_live_walkforward_ko"]["n_covered"],
        },
        "omitted": built["omitted"],
        "csv_reflects": "B_live_walkforward_all",
        "analyses": analyses,
    }

    json_path = ROOT / "data" / "backtest" / "wc2026_calibration.json"
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    csv_path = ROOT / "web" / "public" / "methodology" / "reliability_2026.csv"
    _write_reliability_csv(csv_path, 2026, analyses["B_live_walkforward_all"]["reliability"])

    # concise stdout summary (numbers only; artifacts hold the full detail)
    def line(tag: str, blk: dict) -> str:
        bs_u = blk["baselines"]["uniform"]["brier_skill_score"]
        bs_b = blk["baselines"]["base_rate"]["brier_skill_score"]
        return (f"{tag:28s} n={blk['n_covered']:3d}  brier={blk['brier']:.4f}  "
                f"logloss={blk['log_loss']:.4f}  top1={blk['top1']:.3f}  "
                f"mce={blk['max_calibration_error']:.3f}  "
                f"skill_unif={bs_u:+.3f}  skill_base={bs_b:+.3f}")

    print(f"cond0_run = {built['cond0_run']}")
    for key in ("A_frozen_cond0_group", "B_live_walkforward_group",
                "B_live_walkforward_ko", "B_live_walkforward_all"):
        print(line(key, analyses[key]))
    print(f"omitted rows: {len(built['omitted'])}")
    print(f"wrote {json_path}")
    print(f"wrote {csv_path}")


if __name__ == "__main__":
    main()

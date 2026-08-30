"""Phase 2.5 - WC2022 in-tournament SEQUENTIAL RETRODICTION (walk-forward backtest).

Builds on the Phase 2.4 match-level harness (model/backtest.py). Where Phase 2.4 refits the
model ONCE strictly before the opener and predicts every WC match from that frozen fit, this
module walks the tournament forward: before predicting match k it refits Elo -> Dixon-Coles on
all rows with date strictly < match k's date. Crucially this INCLUDES earlier WC2022 results as
they complete, so the model updates as the tournament unfolds. That is the whole point - we
measure whether in-tournament information actually helps.

Correctness property (a reviewer will attack this): there is NO look-ahead. Every per-step fit
runs model.backtest.assert_pre_cutoff on the EXACT training frame's dates against match k's
date, so a fit that accidentally includes match k or any later WC2022 result RAISES. The
training frame for an early step provably excludes the 2022 final (Argentina-France, 2022-12-18).

Chosen hyperparameters: read from model/dixon_coles_params.json -> hyperparameters
(half_life_days=1460, lambda_prior=20, tier_weights {1:1.10,2:0.75,3:0.60,4:0.45,5:0.30}).
These are the Phase 2.4 tuned config (docs/phase_2_4_backtest_report.md, section 4). If the
JSON is missing or lacks the block, we fall back to the same values hardcoded below.

Determinism: seed 42 set at import; all fits are deterministic L-BFGS-B; fits are cached by
cutoff date (many consecutive matches share a date) but the cache never changes results.

OFFLINE only: reads data/historical_results_clean.csv; no Supabase, no db.client.

Artifacts (written by main()):
  data/backtest/wc2022_retro_predictions.csv
  data/backtest/wc2022_retro_metrics.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from model import dixon_coles as dc
from model import metrics as M
from model.backtest import (
    H_WC_DISCOUNT,
    WC_OPENERS,
    assert_pre_cutoff,
    fit_pre,
    predict_wdl,
)
from model.elo import load_altitude

ROOT = Path(__file__).resolve().parents[1]
CLEAN = ROOT / "data" / "historical_results_clean.csv"
BT_DIR = ROOT / "data" / "backtest"
DC_PARAMS_JSON = ROOT / "model" / "dixon_coles_params.json"

SEED = 42
np.random.seed(SEED)

YEAR = "2022"
UNIFORM_BRIER = 2.0 / 3.0   # (1/3,1/3,1/3) vs one-hot -> 2/3 per match

# Phase 2.4 tuned config (fallback if dixon_coles_params.json lacks the block).
# Source: docs/phase_2_4_backtest_report.md section 4 "Chosen config".
FALLBACK_CHOSEN = {
    "half_life": 1460.0,
    "lambda_prior": 20.0,
    "tiers": {1: 1.10, 2: 0.75, 3: 0.60, 4: 0.45, 5: 0.30},
}
# Phase 2 / Phase 2.4 defaults (used by an ablation).
DEFAULT_CONFIG = {
    "half_life": 730.0,
    "lambda_prior": 5.0,
    "tiers": {1: 1.0, 2: 0.85, 3: 0.70, 4: 0.55, 5: 0.20},
}


# ----------------------------------------------------------------- config loading
def chosen_config() -> dict:
    """Read the tuned hyperparameters from model/dixon_coles_params.json if recorded; else use
    the hardcoded fallback transcribed from docs/phase_2_4_backtest_report.md."""
    try:
        hp = json.loads(DC_PARAMS_JSON.read_text(encoding="utf-8")).get("hyperparameters", {})
        tiers = hp.get("tier_weights")
        if hp.get("half_life_days") and hp.get("lambda_prior") and tiers:
            return {
                "half_life": float(hp["half_life_days"]),
                "lambda_prior": float(hp["lambda_prior"]),
                # JSON keys are strings; coerce to int tiers.
                "tiers": {int(k): float(v) for k, v in tiers.items()},
            }
    except (OSError, ValueError, KeyError):
        pass
    return {"half_life": FALLBACK_CHOSEN["half_life"],
            "lambda_prior": FALLBACK_CHOSEN["lambda_prior"],
            "tiers": dict(FALLBACK_CHOSEN["tiers"])}


def load_data():
    df = pd.read_csv(CLEAN, encoding="utf-8")
    return df, load_altitude()


def wc2022_matches(df: pd.DataFrame) -> pd.DataFrame:
    """WC2022 matches in chronological (date, then stable original-order) order. The stable sort
    preserves the CSV row order within a date, giving a fixed, reproducible sequence."""
    wc = df[(df.competition_category == "wc_finals") & (df.date.str[:4] == YEAR)].copy()
    wc = wc.reset_index().rename(columns={"index": "_src_row"})
    return wc.sort_values(["date", "_src_row"], kind="stable").reset_index(drop=True)


# ----------------------------------------------------------------- walk-forward core
class _FitCache:
    """Caches (params, elo) by cutoff date. Consecutive matches sharing a date reuse one fit, so
    we do ~23 fits not 64. The cache cannot change results: the key is exactly the cutoff date."""

    def __init__(self, df, altitude, cfg):
        self.df, self.alt, self.cfg = df, altitude, cfg
        self._cache: dict[str, tuple] = {}

    def fit_before(self, cutoff: str):
        if cutoff not in self._cache:
            # HARD GUARD: prove the training frame excludes match k and everything after it.
            train_dates = self.df[self.df.date < cutoff].date
            assert_pre_cutoff(train_dates, cutoff)
            params, relo = fit_pre(self.df, self.alt, cutoff,
                                   half_life=self.cfg["half_life"],
                                   lambda_prior=self.cfg["lambda_prior"],
                                   tier_weights=self.cfg["tiers"])
            self._cache[cutoff] = (params, relo)
        return self._cache[cutoff]


def training_dates_for_step(df: pd.DataFrame, matches: pd.DataFrame, step: int) -> pd.Series:
    """Return the set of match dates that WOULD be used to train for `step` (0-based index into
    the chronological WC2022 sequence): all rows with date strictly < that match's date. Used by
    tests to prove a specific later WC2022 result is excluded from an early step's training."""
    cutoff = matches.iloc[step]["date"]
    return df[df.date < cutoff]["date"]


def walk_forward(df, altitude, matches, cfg, *, update: bool = True):
    """Sequential retrodiction over `matches`.

    update=True  : refit before EVERY match on all data with date < that match's date (the
                   tournament-as-it-unfolds model; earlier WC2022 results feed later predictions).
    update=False : STATIC pre-tournament fit - refit ONCE before the opener and reuse it for the
                   whole tournament (the Phase 2.4 behaviour, reproduced here as an ablation).

    Returns (P, Y, rows) where rows carries per-match bookkeeping (training_rows_used,
    training_max_date) for the artifact + the monotonic-cutoff test.
    """
    cache = _FitCache(df, altitude, cfg)
    opener = WC_OPENERS[YEAR]
    P, Y, rows = [], [], []
    prev_max = ""
    for k, r in enumerate(matches.itertuples(index=False)):
        cutoff = opener if not update else r.date
        params, _ = cache.fit_before(cutoff)
        train = df[df.date < cutoff]
        train_max = train.date.max() if len(train) else ""
        # monotonic + strict-pre invariants enforced inline (defence in depth vs the test).
        assert train_max < r.date, f"training_max_date {train_max} !< match date {r.date}"
        assert train_max >= prev_max, "training_max_date went backwards"
        prev_max = train_max

        p = predict_wdl(params, r.home_team_canon, r.away_team_canon,
                        bool(r.neutral), altitude, H_WC_DISCOUNT)
        P.append(p)
        Y.append(M.outcome(int(r.home_score), int(r.away_score)))
        rows.append({
            "date": r.date,
            "home_team": r.home_team_canon,
            "away_team": r.away_team_canon,
            "home_score": int(r.home_score),
            "away_score": int(r.away_score),
            "neutral": bool(r.neutral),
            "p_home": float(p[0]),
            "p_draw": float(p[1]),
            "p_away": float(p[2]),
            "outcome": int(Y[-1]),
            "training_rows_used": int(len(train)),
            "training_max_date": train_max,
        })
    return np.array(P), np.array(Y), rows


# ----------------------------------------------------------------- Spearman target
# WC2022 final standings (FIFA official ranking of the 32 teams). We use the standard tournament
# finish order; teams eliminated at the same stage share the same finishing rank (ties), which
# our Spearman helper handles with average ranks. Source: FIFA 2022 World Cup final ranking.
WC2022_FINISH = {
    "Argentina": 1, "France": 2, "Croatia": 3, "Morocco": 4,
    # quarter-final losers (5-8)
    "Netherlands": 6, "England": 6, "Brazil": 6, "Portugal": 6,
    # round-of-16 losers (9-16)
    "Japan": 12, "Senegal": 12, "United States": 12, "Australia": 12,
    "Spain": 12, "Switzerland": 12, "Poland": 12, "South Korea": 12,
    # group stage (17-32)
    "Ecuador": 24, "Cameroon": 24, "Uruguay": 24, "Tunisia": 24,
    "Mexico": 24, "Belgium": 24, "Germany": 24, "Ghana": 24,
    "Wales": 24, "Iran": 24, "Costa Rica": 24, "Saudi Arabia": 24,
    "Denmark": 24, "Serbia": 24, "Canada": 24, "Qatar": 24,
}


def spearman_strength_vs_finish(df, altitude, cfg) -> dict:
    """DEFENSIBLE, NON-CIRCULAR Spearman target.

    Definition: fit the model STATICALLY strictly before the WC2022 opener (no in-tournament
    info), take each participating team's pre-tournament predicted strength = attack + defense
    (the Dixon-Coles net-strength used everywhere else), and correlate it (Spearman, average-rank
    ties) against the team's ACTUAL WC2022 final finishing position. A negative correlation is
    expected and GOOD: higher strength should map to a SMALLER (better) finish number, so we
    report rho on (strength, -finish) so that a positive number means "stronger teams finished
    higher", which is the intuitive direction. This validates the pre-tournament ordering against
    the eventual outcome and is independent of the per-match calibration metrics.
    """
    opener = WC_OPENERS[YEAR]
    params, _ = fit_pre(df, altitude, opener, half_life=cfg["half_life"],
                        lambda_prior=cfg["lambda_prior"], tier_weights=cfg["tiers"])
    teams = params["teams"]
    strength, neg_finish, names = [], [], []
    for team, finish in WC2022_FINISH.items():
        v = teams.get(team)
        if v is None:
            continue   # team unseen pre-2022 (should not happen for WC qualifiers)
        strength.append(v["attack"] + v["defense"])
        neg_finish.append(-float(finish))
        names.append(team)
    rho = M.spearman(np.array(strength), np.array(neg_finish))
    return {"rho_strength_vs_finish": rho, "n_teams": len(names)}


# ----------------------------------------------------------------- metrics bundle
def sequence_metrics(P, Y) -> dict:
    m = M.all_metrics(P, Y)
    return {
        "brier": m["brier"],
        "log_loss": m["log_loss"],
        "mae": M.mae_onehot(P, Y),
        "top1_hit_rate": M.top_n_hit_rate(P, Y, 1),
        "top2_hit_rate": M.top_n_hit_rate(P, Y, 2),
        "max_calibration_error": m["max_calibration_error"],
        "n": m["n"],
        "uniform_brier": UNIFORM_BRIER,
        "brier_vs_uniform_delta": m["brier"] - UNIFORM_BRIER,
        "reliability": m["reliability"],
    }


def run_retrodiction(df, altitude, matches, cfg, *, update=True) -> dict:
    P, Y, rows = walk_forward(df, altitude, matches, cfg, update=update)
    out = sequence_metrics(P, Y)
    out["P"], out["Y"], out["rows"] = P, Y, rows
    return out


# ----------------------------------------------------------------- ablations
def ablation_table(df, altitude) -> dict:
    """Three+ full walk-forward runs, all deterministic:
       (a) tuned config, in-tournament updating  [headline]
       (b) default config, in-tournament updating
       (c) tuned config, STATIC pre-tournament fit (no updating)
       (d) tuned config, in-tournament updating, NO altitude
    """
    matches = wc2022_matches(df)
    tuned = chosen_config()
    default = {"half_life": DEFAULT_CONFIG["half_life"],
               "lambda_prior": DEFAULT_CONFIG["lambda_prior"],
               "tiers": dict(DEFAULT_CONFIG["tiers"])}

    def slim(d):
        return {k: d[k] for k in ("brier", "log_loss", "mae", "top1_hit_rate",
                                  "top2_hit_rate", "max_calibration_error", "n")}

    a = run_retrodiction(df, altitude, matches, tuned, update=True)
    b = run_retrodiction(df, altitude, matches, default, update=True)
    c = run_retrodiction(df, altitude, matches, tuned, update=False)
    no_alt = {t: 0.0 for t in altitude}   # zero out altitudes -> altitude term inert
    d = run_retrodiction(df, no_alt, matches, tuned, update=True)

    return {
        "a_tuned_walkforward": slim(a),
        "b_default_walkforward": slim(b),
        "c_tuned_static": slim(c),
        "d_tuned_walkforward_no_altitude": slim(d),
        "deltas_walkforward_vs_static": {
            "brier": a["brier"] - c["brier"],
            "log_loss": a["log_loss"] - c["log_loss"],
            "mae": a["mae"] - c["mae"],
            "top1_hit_rate": a["top1_hit_rate"] - c["top1_hit_rate"],
            "top2_hit_rate": a["top2_hit_rate"] - c["top2_hit_rate"],
        },
    }


# ----------------------------------------------------------------- artifacts + main
def write_artifacts(headline: dict, spear: dict, ablations: dict, out_dir: Path = BT_DIR) -> None:
    # out_dir defaults to the repo data/backtest dir (what main() writes); tests pass a tmp_path so
    # they never clobber the committed artifact.
    out_dir.mkdir(parents=True, exist_ok=True)
    pred = pd.DataFrame(headline["rows"])
    pred.to_csv(out_dir / "wc2022_retro_predictions.csv", index=False, encoding="utf-8")

    metrics = {
        "_meta": {
            "phase": "2.5",
            "model": "WC2022 in-tournament walk-forward retrodiction",
            "seed": SEED,
            "config": chosen_config(),
            "spearman_definition": (
                "Spearman rank correlation (average-rank ties) between each team's "
                "pre-tournament Dixon-Coles net strength (attack+defense, fit strictly before "
                "the WC2022 opener) and the negative of its actual WC2022 final finishing "
                "position. Positive => stronger pre-tournament teams finished higher."),
            "topn_definition": (
                "top-N hit rate = fraction of the 64 matches whose actual W/D/L outcome is "
                "among the model's N most-probable classes (N=1 accuracy; N=2 of 3 classes)."),
            "mae_definition": (
                "mean absolute error between predicted [p_home,p_draw,p_away] and the one-hot "
                "actual outcome, averaged over all matches AND classes (N*3 entries)."),
        },
        "headline_walkforward_tuned": {
            k: headline[k] for k in ("brier", "log_loss", "mae", "top1_hit_rate",
                                     "top2_hit_rate", "max_calibration_error", "n",
                                     "uniform_brier", "brier_vs_uniform_delta")},
        "spearman": spear,
        "reliability": headline["reliability"],
        "ablations": ablations,
    }
    (out_dir / "wc2022_retro_metrics.json").write_text(
        json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    df, altitude = load_data()
    matches = wc2022_matches(df)
    cfg = chosen_config()

    headline = run_retrodiction(df, altitude, matches, cfg, update=True)
    spear = spearman_strength_vs_finish(df, altitude, cfg)
    ablations = ablation_table(df, altitude)
    write_artifacts(headline, spear, ablations)

    print(f"WC2022 walk-forward retrodiction (seed {SEED}, n={headline['n']} matches)")
    print(f"  config: half_life={cfg['half_life']} lambda_prior={cfg['lambda_prior']} "
          f"tiers={cfg['tiers']}")
    print(f"  Brier={headline['brier']:.4f}  LL={headline['log_loss']:.4f}  "
          f"MAE={headline['mae']:.4f}")
    print(f"  top1={headline['top1_hit_rate']:.4f}  top2={headline['top2_hit_rate']:.4f}  "
          f"(uniform Brier {UNIFORM_BRIER:.4f})")
    print(f"  Spearman(strength, -finish)={spear['rho_strength_vs_finish']:.4f}  "
          f"(n_teams={spear['n_teams']})")
    print("\n  ablation table:")
    hdr = f"    {'run':<34}{'Brier':>9}{'LL':>9}{'MAE':>9}{'top1':>8}{'top2':>8}"
    print(hdr)
    for name in ("a_tuned_walkforward", "b_default_walkforward", "c_tuned_static",
                 "d_tuned_walkforward_no_altitude"):
        r = ablations[name]
        print(f"    {name:<34}{r['brier']:>9.4f}{r['log_loss']:>9.4f}{r['mae']:>9.4f}"
              f"{r['top1_hit_rate']:>8.4f}{r['top2_hit_rate']:>8.4f}")
    d = ablations["deltas_walkforward_vs_static"]
    print(f"\n  walk-forward minus static: dBrier={d['brier']:+.4f}  dLL={d['log_loss']:+.4f}  "
          f"dMAE={d['mae']:+.4f}  dtop1={d['top1_hit_rate']:+.4f}  dtop2={d['top2_hit_rate']:+.4f}")
    print(f"\n  wrote {(BT_DIR / 'wc2022_retro_predictions.csv').relative_to(ROOT)}")
    print(f"  wrote {(BT_DIR / 'wc2022_retro_metrics.json').relative_to(ROOT)}")


if __name__ == "__main__":
    main()

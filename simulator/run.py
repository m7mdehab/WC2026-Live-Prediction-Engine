"""CLI entry point: run the Monte Carlo shell and write a model_prediction_runs record.

    python -m simulator.run --iters 10000 --seed 42 --sampler uniform
    python -m simulator.run --iters 10000 --seed 42 --sampler random --convergence
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from . import SIMULATOR_VERSION
from .engine import STAGES, monte_carlo
from .loaders import ROOT, load
from .sampler import RandomTripleSampler, UniformSampler

RUNS_DIR = ROOT / "data" / "runs"
DC_PARAMS = ROOT / "model" / "dixon_coles_params.json"


def _calibration_method() -> str:
    f = ROOT / "model" / "calibration_v0.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8")).get("method", "none")
    return "none"


def repo_commit() -> str | None:
    git = ROOT / ".git"
    try:
        ref = (git / "HEAD").read_text().strip()
        if ref.startswith("ref:"):
            return (git / ref.split(" ", 1)[1]).read_text().strip()
        return ref
    except Exception:
        return None


def build_sampler(name: str, seed: int):
    if name == "uniform":
        return UniformSampler(), "placeholder-uniform-v0"
    if name == "random":
        return RandomTripleSampler(seed), "placeholder-random-v0"
    if name == "model":
        from .model_sampler import DixonColesSampler
        if not DC_PARAMS.exists():
            raise SystemExit("model/dixon_coles_params.json missing -- run "
                             "`python -m model.elo && python -m model.dixon_coles` first.")
        from . import SIMULATOR_VERSION  # noqa
        from model import DIXON_COLES_VERSION
        return DixonColesSampler(), DIXON_COLES_VERSION
    raise SystemExit(f"unknown sampler {name!r} (use uniform|random|model)")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description="WC2026 simulator shell (placeholder probabilities)")
    ap.add_argument("--iters", type=int, default=50000)  # production default (Phase 2 sign-off Check 2 remedy)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--sampler", choices=["uniform", "random", "model"], default="uniform")
    ap.add_argument("--convergence", action="store_true",
                    help="also run 50k and report max champion-prob delta vs --iters")
    ap.add_argument("--no-write", action="store_true", help="don't write a run file")
    args = ap.parse_args(argv)

    data = load()
    sampler, model_version = build_sampler(args.sampler, args.seed)

    probs, counts, idx = monte_carlo(data, sampler, args.iters, args.seed)

    now = datetime.now(timezone.utc)
    run = {
        "reproducibility_metadata": {
            "model_version": model_version,
            "simulator_version": SIMULATOR_VERSION,
            "code_version": repo_commit(),
            "git_commit": repo_commit(),
            "data_version": data.training_cutoff_date,
            "data_hash": data.data_hash,
            "rng_seed": args.seed,
            "training_cutoff_date": data.training_cutoff_date,
            "data_cutoff_time": None,
            "calibration_method": _calibration_method() if args.sampler == "model" else None,
            "run_type": "model_forecast" if args.sampler == "model" else "placeholder_shell",
        },
        "run": {
            "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "iterations": args.iters,
            "sampler": args.sampler,
        },
        "champion_probabilities": dict(sorted(
            ((t, probs[t]["champion"]) for t in data.all_teams),
            key=lambda kv: -kv[1])),
        "stage_probabilities": {t: probs[t] for t in data.all_teams},
    }

    if not args.no_write:
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        out = RUNS_DIR / f"{now.strftime('%Y%m%dT%H%M%SZ')}_{args.sampler}_seed{args.seed}.json"
        out.write_text(json.dumps(run, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"wrote {out.relative_to(ROOT)}")

    # console summary
    print(f"\n{args.iters} iters, sampler={args.sampler}, seed={args.seed}")
    print("top-10 champion probability:")
    for t, p in list(run["champion_probabilities"].items())[:10]:
        sp = probs[t]
        print(f"  {p*100:5.2f}%  {t:24s} (adv {sp['advance_group']*100:4.1f}% "
              f"SF {sp['reach_sf']*100:4.1f}% F {sp['reach_final']*100:4.1f}%)")
    total = sum(run["champion_probabilities"].values())
    print(f"champion probabilities sum to {total*100:.2f}% (expect ~100%)")

    if args.convergence:
        probs2, _, _ = monte_carlo(data, sampler, 50000, args.seed)
        delta = max(abs(probs[t]["champion"] - probs2[t]["champion"]) for t in data.all_teams)
        print(f"convergence: max |Δ champion prob| between {args.iters} and 50000 sims "
              f"= {delta*100:.3f} pp (scope_lock target ≤0.5pp)")


if __name__ == "__main__":
    main()

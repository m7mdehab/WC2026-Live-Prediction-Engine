"""§7 final refit + §8 acceptance check. Run after tuning. Writes results JSON + artifacts."""
import sys, json; sys.stdout.reconfigure(encoding="utf-8")
import numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from pathlib import Path
from model import backtest as bt, metrics as M
from model.elo import compute_elo, load_altitude, ALTITUDE_ELO_COEF, OUT_RATINGS, OUT_TIMESERIES
from model import dixon_coles as dc
from simulator.loaders import load
from simulator.engine import monte_carlo
from simulator.model_sampler import DixonColesSampler

ROOT = Path("."); df = pd.read_csv("data/historical_results_clean.csv", encoding="utf-8")
alt = load_altitude()
cfg = json.load(open("data/backtest/tuning_2022.json"))["cfg"]
tiers = {int(k): v for k, v in cfg["tiers"].items()}
HL, LP = cfg["half_life"], cfg["lambda_prior"]
TEAMS = ["France", "Brazil", "Germany", "Mexico", "Japan"]

def champ(probs): return {t: probs[t]["champion"] for t in probs}

# --- §8 pre-tuning champion% (current committed model) ---
data = load()
pre = champ(monte_carlo(data, DixonColesSampler(), 10000, 42)[0])
print("pre-tuning champ% captured")

# --- chosen-config backtest artifacts + reliability (overwrite §1 defaults with final model) ---
for yr in ["2018", "2022"]:
    r = bt.backtest_year(df, alt, yr, half_life=HL, lambda_prior=LP, tier_weights=tiers, save=True)
    m = r["metrics"]
    fig, axes = plt.subplots(1, 3, figsize=(12, 4))
    for c, name in enumerate(M.CLASSES):
        rows = m["reliability"][name]
        mp = [x["mean_pred"] for x in rows if x["n"]]; of = [x["obs_freq"] for x in rows if x["n"]]
        ns = [x["n"] for x in rows if x["n"]]
        ax = axes[c]; ax.plot([0, 1], [0, 1], "k--", lw=0.8)
        ax.scatter(mp, of, s=[20 + 8 * n for n in ns], alpha=0.7)
        ax.set_title(f"{name} (WC{yr}, tuned)"); ax.set_xlim(0, 1); ax.set_ylim(0, 1)
        ax.set_xlabel("predicted"); ax.set_ylabel("observed")
    fig.tight_layout(); fig.savefig(f"docs/reliability_{yr}.png", dpi=90); plt.close(fig)

# --- §7 final refit on full data, overwrite model files ---
relo, rts = compute_elo(df, altitude_coef=ALTITUDE_ELO_COEF, altitude=alt, tier_weights=tiers)
relo.round({"rating": 2}).to_csv(OUT_RATINGS, index=False, encoding="utf-8")
rts.round({"rating": 2}).to_csv(OUT_TIMESERIES, index=False, encoding="utf-8")
params = dc.fit(df, elo=relo, use_altitude=True, altitude=alt, tier_weights=tiers,
                half_life_days=HL, lambda_prior=LP)
dc.OUT.write_text(json.dumps(params, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"final refit: c={params['intercept_c']:.3f} h={params['home_advantage']:.3f} "
      f"ac={params['altitude_coef']:.3f} rho={params['rho']:.4f}")

# calibration decision recorded
calib = {"method": "none",
         "reason": "isotonic worsens 2022 Brier +2.3% (small-window overfit); Platt is "
                   "net-neutral on Brier but degrades log loss on both 2018 and 2022 with no "
                   "calibration gain. Raw model accepted as acceptably calibrated.",
         "evaluated": {"platt": {"2018_brier_delta_pct": 0.5, "2022_brier_delta_pct": -0.3},
                       "isotonic": {"2018_brier_delta_pct": 0.3, "2022_brier_delta_pct": 2.3}}}
(ROOT / "model" / "calibration_v0.json").write_text(json.dumps(calib, indent=2), encoding="utf-8")

# --- §8 post-tuning champion% ---
data = load()
post = champ(monte_carlo(data, DixonColesSampler(), 10000, 42)[0])
elo_rank = {t: i + 1 for i, t in enumerate(relo.sort_values("rating", ascending=False).team)}

results = {"cfg": {"half_life": HL, "lambda_prior": LP, "tiers": tiers},
           "acceptance": {t: {"pre": pre[t], "post": post[t]} for t in TEAMS},
           "top12_post": dict(sorted(post.items(), key=lambda kv: -kv[1])[:12]),
           "elo_top10": list(relo.sort_values("rating", ascending=False).team[:10]),
           "ecuador_rank": elo_rank.get("Ecuador"), "bolivia_rank": elo_rank.get("Bolivia"),
           "mexico_adv_pre_post": None}
json.dump(results, open("data/backtest/final_results.json", "w"), indent=2, ensure_ascii=False)

print("\n=== §8 ACCEPTANCE CHECK (champion%, pre -> post) ===")
exp = {"France": "UP", "Brazil": "UP", "Germany": "UP", "Mexico": "DOWN", "Japan": "DOWN"}
for t in TEAMS:
    d = (post[t] - pre[t]) * 100
    arrow = "UP" if d > 0 else "DOWN"
    ok = "OK" if arrow == exp[t] else "XX"
    print(f"  {t:9s} {pre[t]*100:5.2f}% -> {post[t]*100:5.2f}%  ({d:+.2f}pp) expected {exp[t]:4s} [{ok}]")
print("\ntop-12 post:")
for t, p in list(results["top12_post"].items()):
    print(f"  {p*100:5.2f}%  {t}")
print(f"\nEcuador Elo #{results['ecuador_rank']}, Bolivia #{results['bolivia_rank']}")
print("done")

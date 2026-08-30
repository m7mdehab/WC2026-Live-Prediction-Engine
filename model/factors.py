"""Phase 4 Checkpoint 4B.1 -- honest factor decomposition for upcoming matches.

INTEGRITY RULE: every factor is a real model input or a real fact from our data --
nothing invented. Specifically:
  - rating_gap  : Elo difference (model/elo_ratings.csv) + qualitative band.
  - host_effect : the model's host coefficient h·h_wc_discount (dixon_coles_params.json),
                  applied only when a host nation plays in its own country; else neutral.
  - altitude    : the model's altitude term altitude_coef·burden (dixon_coles_params.json +
                  team/venue altitudes); else neutral.
  - recent_form : the actual last N competitive results per team (historical_results_clean.csv),
                  opponent + score + date + opponent's FIFA rank; flags wins over top-10 sides.
  - fifa_rank   : each side's rank (fifa_rankings_history.csv, latest edition).

These are exactly the inputs that produce the team's rating and the match's λ/μ -- so the
explanations the UI generates from them are accurate by construction.

Judgment calls (flagged):
  - Elo-gap bands: negligible <25, slight 25–75, moderate 75–150, large ≥150 Elo.
  - Recent form: last 6 competitive matches (tiers 1–4).
  - Altitude "material" when venue ≥ 1000 m and a side is ≥ 500 m below it.
  - jsonb shape: see build_factors() docstring.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pandas as pd

# Single source of truth for the host/altitude adjustments the engine applies to λ/μ.
# factors.py reports exactly these -- never a parallel re-derivation.
from simulator.model_sampler import (
    H_WC_DISCOUNT, altitude_log_term, host_log_term, is_host_home,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CUTOFF = date(2026, 6, 3).isoformat()
FORM_N = 6

# Elo-gap bands (absolute Elo points)
ELO_BANDS = [(150, "large"), (75, "moderate"), (25, "slight"), (0, "negligible")]
ALT_MATERIAL_VENUE_M = 1000
ALT_MATERIAL_DIFF_M = 500


def elo_band(diff_abs: float) -> str:
    for thr, name in ELO_BANDS:
        if diff_abs >= thr:
            return name
    return "negligible"


@dataclass
class FactorInputs:
    elo: dict[str, float]
    fifa_rank: dict[str, int]
    team_alt: dict[str, float]
    c: float
    h: float
    altitude_coef: float
    hist: pd.DataFrame


def load_inputs() -> FactorInputs:
    elo = dict(pd.read_csv(ROOT / "model" / "elo_ratings.csv").set_index("team")["rating"])
    fr = pd.read_csv(DATA / "fifa_rankings_history.csv")
    latest = fr[fr.edition_date == fr.edition_date.max()]
    fifa_rank = dict(zip(latest.team, latest["rank"].astype(int)))
    alt = pd.read_csv(DATA / "team_home_altitude.csv")
    team_alt = dict(zip(alt.team, alt.home_altitude_m.astype(float)))
    params = json.loads((ROOT / "model" / "dixon_coles_params.json").read_text(encoding="utf-8"))
    hist = pd.read_csv(DATA / "historical_results_clean.csv")
    hist = hist[hist["date"] < CUTOFF]
    return FactorInputs(elo, fifa_rank, team_alt, params["intercept_c"], params["home_advantage"],
                        params.get("altitude_coef", 0.0), hist)


def recent_form(team: str, I: FactorInputs, n: int = FORM_N) -> list[dict]:
    h = I.hist
    mask = ((h.home_team_canon == team) | (h.away_team_canon == team)) & (h.is_competitive)
    rows = h[mask].sort_values("date").tail(n)
    out = []
    for r in rows.itertuples(index=False):
        home = r.home_team_canon == team
        opp = r.away_team_canon if home else r.home_team_canon
        gf, ga = (r.home_score, r.away_score) if home else (r.away_score, r.home_score)
        res = "W" if gf > ga else ("D" if gf == ga else "L")
        opp_rank = I.fifa_rank.get(opp)
        out.append({
            "date": r.date, "opponent": opp,
            "venue": "home" if (home and not r.neutral) else ("away" if (not home and not r.neutral) else "neutral"),
            "score": f"{int(gf)}-{int(ga)}", "result": res,
            "competition": r.competition_category,
            "opponent_rank": opp_rank,
            "notable": bool(res == "W" and opp_rank is not None and opp_rank <= 10),
        })
    return list(reversed(out))  # most-recent first


def compute_factors(team_a: str, team_b: str, *, venue_altitude_m: float,
                    venue_country: str | None, I: FactorInputs) -> dict:
    elo_a, elo_b = I.elo.get(team_a), I.elo.get(team_b)
    diff = (elo_a - elo_b) if (elo_a is not None and elo_b is not None) else None
    rating_gap = {
        "elo_a": round(elo_a, 1) if elo_a is not None else None,
        "elo_b": round(elo_b, 1) if elo_b is not None else None,
        "diff": round(diff, 1) if diff is not None else None,
        "favored": (team_a if diff > 0 else team_b) if diff else None,
        "band": elo_band(abs(diff)) if diff is not None else None,
    }

    # host: exactly the engine's host_log_term (h·h_wc_discount) for a host in its own country
    host_team = (team_a if is_host_home(team_a, venue_country)
                 else team_b if is_host_home(team_b, venue_country) else None)
    host_effect = (
        {"applies": True, "team": host_team,
         "coef_log_goals": round(host_log_term(I.h, H_WC_DISCOUNT, True), 4),
         "h": round(I.h, 4), "h_wc_discount": H_WC_DISCOUNT,
         "note": f"{host_team} hosting in {venue_country}"}
        if host_team else {"applies": False}
    )

    # altitude: exactly the engine's altitude_log_term per side; report the disadvantaged one
    va = float(venue_altitude_m or 0)
    term_a = altitude_log_term(I.altitude_coef, va, I.team_alt.get(team_a, 0.0))
    term_b = altitude_log_term(I.altitude_coef, va, I.team_alt.get(team_b, 0.0))
    disadv = team_a if term_a < term_b else (team_b if term_b < term_a else None)
    penalty = min(term_a, term_b)
    max_bur = (-penalty / I.altitude_coef) if I.altitude_coef else 0.0
    material = va >= ALT_MATERIAL_VENUE_M and (max_bur * 1000.0) >= ALT_MATERIAL_DIFF_M
    altitude = (
        {"applies": True, "venue_altitude_m": int(va), "disadvantaged_team": disadv,
         "burden_km": round(max_bur, 2), "goal_rate_penalty_log": round(penalty, 4),
         "altitude_coef": round(I.altitude_coef, 4)}
        if material else {"applies": False, "venue_altitude_m": int(va)}
    )

    return {
        "team_a": team_a, "team_b": team_b,
        "rating_gap": rating_gap,
        "host_effect": host_effect,
        "altitude": altitude,
        "fifa_rank": {"team_a": I.fifa_rank.get(team_a), "team_b": I.fifa_rank.get(team_b)},
        "recent_form": {"team_a": recent_form(team_a, I), "team_b": recent_form(team_b, I)},
    }


def fixture_venue_map() -> dict[str, dict]:
    """match_id -> {venue_altitude_m, country, team_a, team_b, stage} from the locked fixtures."""
    fx = pd.read_csv(DATA / "fixtures_2026.csv")
    venues = json.loads((DATA / "venues_2026.json").read_text(encoding="utf-8"))["venues"]
    valt = {v["venue_id"]: v["altitude_m"] for v in venues}
    out = {}
    for r in fx.itertuples(index=False):
        out[r.match_id] = {"venue_altitude_m": valt.get(r.venue_id, 0), "country": r.country,
                           "team_a": r.team_a, "team_b": r.team_b, "stage": r.stage}
    return out


def _print_sample(mid: str, ctx: dict, f: dict, I: FactorInputs) -> None:
    rg, he, al = f["rating_gap"], f["host_effect"], f["altitude"]
    print(f"\n{'='*70}\n{mid}: {f['team_a']} vs {f['team_b']}  (@ {ctx['country']}, "
          f"venue {ctx['venue_altitude_m']} m)\n{'='*70}")
    print(f"  RATING GAP: {f['team_a']} {rg['elo_a']} vs {f['team_b']} {rg['elo_b']} "
          f"-> diff {rg['diff']:+} ({rg['band']}, favors {rg['favored']})")
    print(f"     trace -> elo_ratings.csv: {f['team_a']}={I.elo.get(f['team_a']):.1f}, "
          f"{f['team_b']}={I.elo.get(f['team_b']):.1f}")
    print(f"  HOST: {he}")
    if he.get("applies"):
        print(f"     trace -> dixon_coles_params.home_advantage h={I.h:.3f} x discount {H_WC_DISCOUNT}")
    print(f"  ALTITUDE: {al}")
    if al.get("applies"):
        d = al["disadvantaged_team"]
        print(f"     trace -> venue {al['venue_altitude_m']}m - {d} home "
              f"{I.team_alt.get(d,0):.0f}m, altitude_coef={I.altitude_coef:.3f}")
    print(f"  FIFA RANK: {f['team_a']} #{f['fifa_rank']['team_a']}, "
          f"{f['team_b']} #{f['fifa_rank']['team_b']}  (trace -> fifa_rankings_history latest)")
    for side in ("team_a", "team_b"):
        nm = f[side]
        print(f"  RECENT FORM -- {nm} (last {len(f['recent_form'][side])} competitive):")
        for m in f["recent_form"][side]:
            star = " ★ win vs top-10" if m["notable"] else ""
            print(f"     {m['date']} {m['result']} {m['score']} vs {m['opponent']} "
                  f"(#{m['opponent_rank']}, {m['venue']}, {m['competition']}){star}")


def main() -> None:
    I = load_inputs()
    vmap = fixture_venue_map()
    groups = {mid: c for mid, c in vmap.items() if c["stage"] == "group"}
    facts = {mid: compute_factors(c["team_a"], c["team_b"],
                                  venue_altitude_m=c["venue_altitude_m"],
                                  venue_country=c["country"], I=I) for mid, c in groups.items()}

    def diff(mid): return abs(facts[mid]["rating_gap"]["diff"] or 0)
    favorite = max(groups, key=diff)
    host = next((m for m in groups if facts[m]["host_effect"]["applies"]
                 and not facts[m]["altitude"]["applies"]), None)
    altitude = max(groups, key=lambda m: facts[m]["altitude"].get("burden_km", 0)
                   if facts[m]["altitude"]["applies"] else 0)
    close = min((m for m in groups if diff(m) > 0), key=diff)

    print("REPRESENTATIVE MATCHES (group stage):")
    print(f"  favorite={favorite}  host={host}  altitude={altitude}  close={close}")
    for label, mid in [("CLEAR FAVORITE", favorite), ("HOST-NATION", host),
                       ("HIGH-ALTITUDE", altitude), ("CLOSE MATCH", close)]:
        if mid is None:
            continue
        print(f"\n###### {label} ######")
        _print_sample(mid, groups[mid], facts[mid], I)


if __name__ == "__main__":
    main()


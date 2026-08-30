"""Phase 2.1 -- tournament-weighted Elo on cleaned historical results.

Standard international-football Elo (eloratings.net tradition). Hyperparameters are
JUDGMENT CALLS, flagged here and tunable (Phase 2 refinement chose the defaults below):

  BASE_K = 32                 base K-factor (PM-specified).
  K(match) = BASE_K * tournament_weight * gd_mult
  gd_mult by GD_MULT_KIND:
      "ln"        1 + ln(1+|gd|)              (gd3 -> 2.39)   [default / control]
      "sqrt"      1 + sqrt(|gd|)/2            (gd3 -> 1.87)   gentler on blowouts
      "ln_capped" min(1+ln(1+|gd|), 2.0)      (gd3 -> 2.00)   capped
  HOME_ADV_ELO = 65           rating points added to the home side on non-neutral matches.

  ALTITUDE -- added in the Phase 2 refinement to stop high-altitude home wins (Quito,
  La Paz, Bogotá) from inflating ratings. Per match, with
      venue_altitude = home_team_altitude if not neutral else 0
      disadvantage(team) = max(0, venue_altitude - team_home_altitude) / 1000   (km)
  the EXPECTED score uses effective ratings
      r_eff(team) = rating(team) - ALTITUDE_ELO_COEF * disadvantage(team)
  so a sea-level side visiting Quito is already expected to do worse; beating them yields
  a smaller residual and a smaller Elo gain. ALTITUDE_ELO_COEF = 50 -> a sea-level team at
  Quito (2.85 km) loses ~143 effective Elo, ~matching bookmaker handicaps. [JUDGMENT CALL]
  Altitude is TEAM-level (data/team_home_altitude.csv); altitude only enters non-neutral
  matches (a team's own country). 2026 neutral-venue altitude is handled in the DC sampler.

Predecessor states: martj42 folds West Germany->Germany and USSR->Russia already; genuine
splits (Czechoslovakia->Czech/Slovakia, Yugoslavia->Croatia/Bosnia/...) seed the successor
at 1500 + frac*(predecessor_rating - 1500) at the split date. Negligible 2026 impact
(saturation); documented + tunable. [JUDGMENT CALL]

All teams start at 1500. Outputs: model/elo_ratings.csv, model/elo_timeseries.csv.
"""
from __future__ import annotations

import math
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CLEAN = ROOT / "data" / "historical_results_clean.csv"
ALTITUDE_CSV = ROOT / "data" / "team_home_altitude.csv"
OUT_RATINGS = ROOT / "model" / "elo_ratings.csv"
OUT_TIMESERIES = ROOT / "model" / "elo_timeseries.csv"

BASE_K = 32.0
HOME_ADV_ELO = 65.0          # chosen default (see phase_2_refinement_notes.md)
GD_MULT_KIND = "ln"          # chosen default
ALTITUDE_ELO_COEF = 50.0     # chosen default
INITIAL = 1500.0

# Phase 2.4-tuned tier weights (chosen on the 2022 backtest). Elo K scales with these;
# main() uses them so regeneration matches the committed final model.
CHOSEN_TIER_WEIGHTS = {1: 1.10, 2: 0.75, 3: 0.60, 4: 0.45, 5: 0.30}

PREDECESSOR_SEED = {
    "Czech Republic": ("Czechoslovakia", "1993-01-01", 0.5),
    "Slovakia": ("Czechoslovakia", "1993-01-01", 0.5),
    "Croatia": ("Yugoslavia", "1991-01-01", 0.4),
    "Bosnia and Herzegovina": ("Yugoslavia", "1992-01-01", 0.4),
    "Slovenia": ("Yugoslavia", "1991-01-01", 0.4),
    "North Macedonia": ("Yugoslavia", "1991-01-01", 0.3),
}


def gd_multiplier(goal_diff: int, kind: str = GD_MULT_KIND) -> float:
    g = abs(goal_diff)
    if kind == "ln":
        return 1.0 + math.log(1.0 + g)
    if kind == "sqrt":
        return 1.0 + math.sqrt(g) / 2.0
    if kind == "ln_capped":
        return min(1.0 + math.log(1.0 + g), 2.0)
    raise ValueError(f"unknown gd_mult_kind {kind!r}")


def expected_score(r_a: float, r_b: float) -> float:
    return 1.0 / (1.0 + 10 ** ((r_b - r_a) / 400.0))


def load_altitude() -> dict[str, float]:
    df = pd.read_csv(ALTITUDE_CSV, encoding="utf-8")
    return dict(zip(df.team, df.home_altitude_m.astype(float)))


def compute_elo(df: pd.DataFrame | None = None, *, fit_max_date: str | None = None,
                home_adv_elo: float = HOME_ADV_ELO, gd_mult_kind: str = GD_MULT_KIND,
                altitude_coef: float = 0.0, altitude: dict | None = None,
                tier_weights: dict | None = None, track_team: str | None = None,
                return_features: bool = False):
    if df is None:
        df = pd.read_csv(CLEAN, encoding="utf-8")
    if fit_max_date is not None:
        df = df[df["date"] < fit_max_date]
        assert (df["date"] < fit_max_date).all(), "LEAKAGE: row with date >= fit_max_date"
    if altitude is None:
        altitude = load_altitude() if altitude_coef else {}
    df = df.sort_values("date", kind="stable").reset_index(drop=True)

    ratings: dict[str, float] = {}
    played: dict[str, int] = {}
    last_date: dict[str, str] = {}
    seeded: set[str] = set()
    ts_dates, ts_teams, ts_ratings = [], [], []
    track: list[dict] = []
    feats: list[dict] = []

    def alt(t): return altitude.get(t, 0.0)

    for row in df.itertuples(index=False):
        home, away, date = row.home_team_canon, row.away_team_canon, row.date

        for team in (home, away):
            if team in PREDECESSOR_SEED and team not in seeded:
                pred, split, frac = PREDECESSOR_SEED[team]
                if date >= split:
                    ratings[team] = INITIAL + frac * (ratings.get(pred, INITIAL) - INITIAL)
                    seeded.add(team)

        ra, rb = ratings.get(home, INITIAL), ratings.get(away, INITIAL)
        neutral = bool(row.neutral)
        ha = home_adv_elo if not neutral else 0.0

        venue_alt = alt(home) if not neutral else 0.0
        dis_home = max(0.0, venue_alt - alt(home)) / 1000.0
        dis_away = max(0.0, venue_alt - alt(away)) / 1000.0
        ra_eff = ra - altitude_coef * dis_home
        rb_eff = rb - altitude_coef * dis_away
        exp_home = expected_score(ra_eff + ha, rb_eff)

        hs, as_ = int(row.home_score), int(row.away_score)
        actual = 1.0 if hs > as_ else (0.0 if hs < as_ else 0.5)
        tw = tier_weights[int(row.tournament_tier)] if tier_weights else float(row.tournament_weight)
        k = BASE_K * tw * gd_multiplier(hs - as_, gd_mult_kind)
        delta = k * (actual - exp_home)

        if return_features:
            feats.append({"date": date, "home": home, "away": away,
                          "elo_home_pre": ra, "elo_away_pre": rb, "neutral": neutral,
                          "outcome": 0 if hs > as_ else (1 if hs == as_ else 2)})

        ratings[home] = ra + delta
        ratings[away] = rb - delta

        for t in (home, away):
            played[t] = played.get(t, 0) + 1
            last_date[t] = date
            ts_dates.append(date); ts_teams.append(t); ts_ratings.append(ratings[t])

        if track_team in (home, away):
            is_home = track_team == home
            opp = away if is_home else home
            track.append({
                "date": date, "opponent": opp,
                "venue": "home" if (is_home and not neutral) else ("away" if (not is_home and not neutral) else "neutral"),
                "score": f"{hs}-{as_}" if is_home else f"{as_}-{hs}",
                "neutral": neutral, "tier_weight": float(row.tournament_weight),
                "opp_alt_disadv_km": round(dis_away if is_home else dis_home, 2),
                "elo_change": round(delta if is_home else -delta, 2),
                "rating_after": round(ratings[track_team], 1),
            })

    ratings_df = pd.DataFrame({
        "team": list(ratings.keys()),
        "rating": [ratings[t] for t in ratings],
        "matches_played": [played[t] for t in ratings],
        "last_match_date": [last_date[t] for t in ratings],
    }).sort_values("rating", ascending=False).reset_index(drop=True)
    ts_df = pd.DataFrame({"date": ts_dates, "team": ts_teams, "rating": ts_ratings})

    if track_team is not None:
        return ratings_df, ts_df, track
    if return_features:
        return ratings_df, ts_df, pd.DataFrame(feats)
    return ratings_df, ts_df


def main() -> None:
    ratings_df, ts_df = compute_elo(altitude_coef=ALTITUDE_ELO_COEF,
                                    tier_weights=CHOSEN_TIER_WEIGHTS)
    OUT_RATINGS.parent.mkdir(parents=True, exist_ok=True)
    ratings_df.round({"rating": 2}).to_csv(OUT_RATINGS, index=False, encoding="utf-8")
    ts_df.round({"rating": 2}).to_csv(OUT_TIMESERIES, index=False, encoding="utf-8")

    print(f"teams rated: {len(ratings_df)}   timeseries rows: {len(ts_df)}   "
          f"(alt_coef={ALTITUDE_ELO_COEF}, gd={GD_MULT_KIND}, home_adv={HOME_ADV_ELO})")
    print("top-15 Elo:")
    for _, r in ratings_df.head(15).iterrows():
        print(f"  {r.rating:7.1f}  {r.team:24s} ({r.matches_played} matches)")
    rank = {t: i + 1 for i, t in enumerate(ratings_df.team)}
    for t in ("Ecuador", "Bolivia", "Colombia", "Mexico"):
        if t in rank:
            print(f"  rank[{t}] = #{rank[t]}")

    import json
    fr = json.loads((ROOT / "data" / "fifa_ranking_2026.json").read_text(encoding="utf-8"))
    expected = set(fr["sanity_check"]["expected_elo_top_10"])
    top10 = set(ratings_df.head(10)["team"])
    print(f"\ntop-10 overlap with expected_elo_top_10: {len(expected & top10)}/10")


if __name__ == "__main__":
    main()

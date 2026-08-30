"""DixonColesSampler -- feeds the simulator from the fitted Dixon-Coles model.

Same MatchSampler interface as the placeholder samplers (engine unchanged). For 2026:
  - Host advantage h applies to a host nation playing in its own country, scaled by
    H_WC_DISCOUNT (Phase 2 refinement: WC hosting carries empirically less home-field
    benefit than a typical home match, so h can be discounted for WC host fixtures).
  - Altitude: every match uses its real venue altitude (venues_2026.json); a team's goal
    rate is penalised by altitude_coef · max(0, venue_alt - team_home_alt)/1000. A non-Mexico
    side in Mexico City suffers; Mexico does not. Mexico in (sea-level) Monterrey gets no
    altitude help, but neither does its visitor -- the intended behaviour.

  group_score:     samples a scoreline from the Dixon-Coles corrected score matrix.
  knockout_winner: marginal win/draw/loss from the matrix, draw folded 50/50, sample winner.
"""
from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import numpy as np

from model.dixon_coles import score_matrix

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
HOST_COUNTRY = {"Mexico": "Mexico", "Canada": "Canada", "United States": "United States"}
MAX_GOALS = 10
H_WC_DISCOUNT = 0.7   # chosen default (Phase 2 refinement; see phase_2_refinement_notes.md)


# ---- single source of truth for the host + altitude adjustments applied to λ/μ ----
# These are the EXACT terms _lam_mu() adds in log-goal-rate. The factor-decomposition
# backend imports these so its reported effects equal what the engine applies.
def is_host_home(team: str, venue_country: str | None) -> bool:
    return HOST_COUNTRY.get(team) is not None and venue_country == HOST_COUNTRY.get(team)


def host_log_term(h: float, h_wc_discount: float, is_home: bool) -> float:
    return h * h_wc_discount if is_home else 0.0


def altitude_log_term(altitude_coef: float, venue_alt_m: float, team_alt_m: float) -> float:
    return -altitude_coef * max(0.0, (venue_alt_m or 0.0) - (team_alt_m or 0.0)) / 1000.0


class DixonColesSampler:
    def __init__(self, params: dict | None = None, fixtures_csv: Path | None = None,
                 h_wc_discount: float = H_WC_DISCOUNT):
        if params is None:
            params = json.loads((ROOT / "model" / "dixon_coles_params.json").read_text(encoding="utf-8"))
        self.c = params["intercept_c"]
        self.h = params["home_advantage"]
        self.rho = params["rho"]
        self.altitude_coef = params.get("altitude_coef", 0.0)
        self.h_wc_discount = h_wc_discount
        self.att = {t: v["attack"] for t, v in params["teams"].items()}
        self.dfn = {t: v["defense"] for t, v in params["teams"].items()}

        venues = json.loads((DATA / "venues_2026.json").read_text(encoding="utf-8"))["venues"]
        venue_alt = {v["venue_id"]: float(v["altitude_m"]) for v in venues}
        alt_df = csv.DictReader(open(DATA / "team_home_altitude.csv", encoding="utf-8"))
        self.team_alt = {r["team"]: float(r["home_altitude_m"]) for r in alt_df}

        self.venue_country: dict[str, str] = {}
        self.match_alt: dict[str, float] = {}
        with open(fixtures_csv or DATA / "fixtures_2026.csv", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                self.venue_country[row["match_id"]] = row["country"]
                self.match_alt[row["match_id"]] = venue_alt.get(row["venue_id"], 0.0)

    def _is_home(self, team, match_id) -> bool:
        return is_host_home(team, self.venue_country.get(match_id))

    def _host_term(self, team, match_id) -> float:
        return host_log_term(self.h, self.h_wc_discount, self._is_home(team, match_id))

    def _altitude_term(self, team, match_id) -> float:
        return altitude_log_term(self.altitude_coef, self.match_alt.get(match_id, 0.0),
                                 self.team_alt.get(team, 0.0))

    def _lam_mu(self, match_id, a, b):
        log_lam = (self.c + self.att.get(a, 0.0) - self.dfn.get(b, 0.0)
                   + self._host_term(a, match_id) + self._altitude_term(a, match_id))
        log_mu = (self.c + self.att.get(b, 0.0) - self.dfn.get(a, 0.0)
                  + self._host_term(b, match_id) + self._altitude_term(b, match_id))
        return math.exp(log_lam), math.exp(log_mu)

    def group_score(self, match_id, a, b, rng):
        lam, mu = self._lam_mu(match_id, a, b)
        flat = score_matrix(lam, mu, self.rho, MAX_GOALS).ravel()
        k = int(np.searchsorted(np.cumsum(flat), rng.random() * flat.sum()))
        return divmod(k, MAX_GOALS + 1)

    def knockout_winner(self, match_id, a, b, rng):
        lam, mu = self._lam_mu(match_id, a, b)
        mat = score_matrix(lam, mu, self.rho, MAX_GOALS)
        p_a = np.tril(mat, -1).sum()
        p_draw = np.trace(mat)
        wa = p_a + p_draw / 2.0
        return (a, b) if rng.random() < wa else (b, a)

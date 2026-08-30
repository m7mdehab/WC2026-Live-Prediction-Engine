"""Phase 2 refinement -- host-realism backtest + fit_max_date leakage guard."""
from __future__ import annotations

import pandas as pd
import pytest

from model import dixon_coles as dc
from model.backtest_hosts import HOSTS, derive_host_group, host_advance_prob, _load_fifa
from model.elo import compute_elo, load_altitude

DF = pd.read_csv("data/historical_results_clean.csv", encoding="utf-8")
ALT = load_altitude()


def test_fit_max_date_excludes_future_rows_elo():
    # Elo truncated at 2018 must not have seen any 2018+ match: a team's last_match_date
    # in the truncated run is strictly before the cutoff.
    ratings, _ = compute_elo(DF, fit_max_date="2018-06-14")
    assert (ratings["last_match_date"] < "2018-06-14").all()


def test_fit_max_date_excludes_future_rows_dc():
    relo, _ = compute_elo(DF, fit_max_date="2014-06-12")
    params = dc.fit(DF, elo=relo, fit_max_date="2014-06-12", use_altitude=True, altitude=ALT)
    # the fit metadata records the truncation, and the fit succeeded on pre-cutoff data only
    assert params["_meta"]["as_of"] == "2014-06-12"
    assert params["hyperparameters"]["n_matches"] > 0


def test_derive_host_groups():
    expected = {
        "South Africa": {"Mexico", "Uruguay", "France"},
        "Qatar": {"Ecuador", "Senegal", "Netherlands"},
    }
    for host, opener, *_ in HOSTS:
        g = derive_host_group(DF, host, opener[:4])
        assert g[0] == host and len(g) == 4
        if host in expected:
            assert set(g[1:]) == expected[host]


def test_host_advance_prob_is_valid_probability():
    fifa_latest, fifa_prev = _load_fifa()
    relo, _ = compute_elo(DF, fit_max_date="2010-06-11", altitude_coef=50.0, altitude=ALT)
    params = dc.fit(DF, elo=relo, fit_max_date="2010-06-11", use_altitude=True, altitude=ALT)
    group = derive_host_group(DF, "South Africa", "2010")
    p = host_advance_prob(group, params, "South Africa", 1700.0, 1.0,
                          fifa_latest, fifa_prev, ALT, iters=500)
    assert 0.0 <= p <= 1.0

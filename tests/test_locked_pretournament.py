"""Byte-stability test for the frozen pre-tournament projection bundle (Feature 1).

Asserts that re-running scripts/gen_locked_pretournament.py on the COMMITTED artifact reproduces
web/src/lib/data/locked_pretournament.json byte-for-byte (content, modulo the platform newline
translation git itself applies on checkout), and that a fixed player carries the exact committed value.

Self-contained: reads only the committed artifact + committed bundle, so it runs on a creds-free clone
(it does NOT skip).
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / "scripts" / "gen_locked_pretournament.py"
OUT = ROOT / "web" / "src" / "lib" / "data" / "locked_pretournament.json"


def _load_generator():
    spec = importlib.util.spec_from_file_location("gen_locked_pretournament", GEN)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def test_regenerate_is_byte_stable():
    """A fresh generate reproduces the committed bundle exactly (content-identical)."""
    mod = _load_generator()
    fresh = mod.build_json_text()
    committed = OUT.read_text(encoding="utf-8")  # text mode normalizes newlines to \n, matching build_json_text
    assert fresh == committed, "committed locked_pretournament.json is stale; re-run scripts/gen_locked_pretournament.py"


def test_generator_is_deterministic():
    """Two generates are byte-identical (no dict-order / float-repr drift)."""
    mod = _load_generator()
    assert mod.build_json_text() == mod.build_json_text()


def test_fixed_player_value_matches_committed():
    """The fixed join player's frozen xG/xA equal the exact committed values."""
    bundle = json.loads(OUT.read_text(encoding="utf-8"))
    depay = bundle["byStatsbomb"]["2988"]
    assert depay["name"] == "Memphis Depay"
    assert depay["nation"] == "Netherlands"
    assert depay["xgPre"] == 0.9198
    assert depay["xaPre"] == 0.6578
    # the name+nation fallback key points at the same record.
    assert bundle["byNameNation"]["memphisdepay|netherlands"]["xgPre"] == 0.9198


def test_meta_is_honest_pretournament_label():
    """The bundle labels itself honestly as the pre-tournament baseline as-of the artifact snapshot."""
    bundle = json.loads(OUT.read_text(encoding="utf-8"))
    meta = bundle["_meta"]
    assert meta["label"] == "pre-tournament baseline"
    assert meta["as_of"] == "2026-06-14"
    assert meta["artifact_version"] == "players-projections-v2.0"


def test_check_flag_reports_up_to_date():
    """The generator's --check mode reports the committed bundle is up to date (exit 0)."""
    mod = _load_generator()
    assert mod.main(["--check"]) == 0

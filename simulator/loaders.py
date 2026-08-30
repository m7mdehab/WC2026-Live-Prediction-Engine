"""Load locked Phase 1 data into plain Python structures for the hot simulation loop.

Everything here is read once; the Monte Carlo loop touches only dicts/lists/ints
(no pandas) for speed.
"""
from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

# Winner slots that face a third-placed team (in Annex C column order).
WINNER_SLOTS_FACING_THIRDS = ["1A", "1B", "1D", "1E", "1G", "1I", "1K", "1L"]


@dataclass
class GroupMatch:
    match_id: str
    group: str
    team_a: str
    team_b: str


@dataclass
class SlotMatch:
    match_id: str
    stage: str
    team_a_slot: str   # "1A","2B","W74","L101", or "best3:1E" (resolve via combo)
    team_b_slot: str


@dataclass
class TournamentData:
    groups: dict[str, list[str]]              # group -> [seed1..seed4]
    team_group: dict[str, str]                # team -> group
    all_teams: list[str]
    group_matches: list[GroupMatch]           # 72
    ko_matches: list[SlotMatch]               # 32, in match-number order M73..M104
    combo_lookup: dict[tuple, dict[str, str]] # sorted 8 groups -> {winnerslot: "3X"}
    fifa_latest: dict[str, int]               # team -> rank (latest edition)
    fifa_prev: list[dict[str, int]]           # previous editions, newest-first
    data_hash: str                            # results.csv SHA-256 (from manifest)
    training_cutoff_date: str


def _load_groups() -> tuple[dict, dict, list]:
    groups, team_group, all_teams = {}, {}, []
    with open(DATA / "groups_2026.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            g = row["group_code"]
            seeds = [row["seed1"], row["seed2"], row["seed3"], row["seed4"]]
            groups[g] = seeds
            for t in seeds:
                team_group[t] = g
                all_teams.append(t)
    return groups, team_group, all_teams


def _load_fixtures() -> tuple[list, list]:
    group_matches, ko = [], []
    with open(DATA / "fixtures_2026.csv", encoding="utf-8") as f:
        rows = sorted(csv.DictReader(f), key=lambda r: int(r["match_no"]))
    for r in rows:
        if r["stage"] == "group":
            group_matches.append(GroupMatch(r["match_id"], r["group_code"], r["team_a"], r["team_b"]))
        else:
            ko.append(SlotMatch(r["match_id"], r["stage"], r["team_a"], r["team_b"]))
    return group_matches, ko


def _load_combo_lookup() -> dict[tuple, dict[str, str]]:
    doc = json.loads((DATA / "third_place_matrix_2026.json").read_text(encoding="utf-8"))
    out = {}
    for c in doc["combinations"]:
        key = tuple(sorted(c["qualifying_third_place_groups"]))
        out[key] = c["r32_assignments"]
    return out


def _load_fifa() -> tuple[dict, list]:
    editions: dict[str, dict[str, int]] = {}
    with open(DATA / "fifa_rankings_history.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            editions.setdefault(row["edition_date"], {})[row["team"]] = int(row["rank"])
    dates = sorted(editions, reverse=True)        # newest first
    latest = editions[dates[0]]
    prev = [editions[d] for d in dates[1:]]
    return latest, prev


def _resolve_ko_slots(ko: list[SlotMatch]) -> list[SlotMatch]:
    """Tag best3 slots so the engine knows to use the Annex C combo. knockout_slots
    R32 stores team_b as 'best3_of_XYZ' for the 8 winner-vs-third matches; we replace
    that with 'best3:<winner_slot>' so resolution reads combo[winner_slot]."""
    out = []
    for m in ko:
        a, b = m.team_a_slot, m.team_b_slot
        if str(b).startswith("best3_of_"):
            b = f"best3:{a}"        # a is the winner slot (e.g. '1E')
        out.append(SlotMatch(m.match_id, m.stage, a, b))
    return out


def load() -> TournamentData:
    groups, team_group, all_teams = _load_groups()
    group_matches, ko = _load_fixtures()
    ko = _resolve_ko_slots(ko)
    combo_lookup = _load_combo_lookup()
    fifa_latest, fifa_prev = _load_fifa()

    manifest = json.loads((DATA / "data_manifest.json").read_text(encoding="utf-8"))
    data_hash = manifest["reproducibility_metadata"]["data_hash"]
    cutoff = manifest["reproducibility_metadata"]["training_cutoff_date"]

    # integrity checks
    assert len(all_teams) == 48, f"expected 48 teams, got {len(all_teams)}"
    assert len(group_matches) == 72, f"expected 72 group matches, got {len(group_matches)}"
    assert len(ko) == 32, f"expected 32 knockout matches, got {len(ko)}"
    assert len(combo_lookup) == 495, f"expected 495 combos, got {len(combo_lookup)}"
    for t in all_teams:
        assert t in fifa_latest, f"team {t} missing from latest FIFA ranking"

    return TournamentData(
        groups=groups, team_group=team_group, all_teams=all_teams,
        group_matches=group_matches, ko_matches=ko, combo_lookup=combo_lookup,
        fifa_latest=fifa_latest, fifa_prev=fifa_prev,
        data_hash=data_hash, training_cutoff_date=cutoff,
    )

"""The allowlist, enforced against what is actually tracked, with a control for every way it can fail.

THE ASYMMETRY THAT SHAPES THIS FILE. A false rejection costs somebody a minute and a line in the
allowlist. A false admission publishes a business document, an unreleased brand system, or a
credential, permanently, into a repository whose URL is already in outbound email. So every check
below is paired with a planted offender proving it fires, and the planted set covers each category the
brief names rather than one representative.

RUN AGAINST `git ls-files`, NOT A DIRECTORY WALK. The question is what is COMMITTED, which is what
publishes. An untracked file in a working tree is not published and a tracked file that has been
deleted from disk still is, until the deletion is committed.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tools.publication_allowlist import (  # noqa: E402
    ALLOW,
    FORBIDDEN_SUBSTRINGS,
    admitted_by,
    forbidden,
    forbidden_reason,
    unlisted,
)


def tracked_files() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files"], cwd=REPO_ROOT, capture_output=True, text=True, check=True
    ).stdout
    return [line.strip() for line in out.splitlines() if line.strip()]


# ---------------------------------------------------------------------------------------------
# Non-vacuity, first
# ---------------------------------------------------------------------------------------------

def test_there_is_something_to_check() -> None:
    """Every assertion below iterates the tracked set, and iterating an empty set passes forever. If
    `git ls-files` stops returning anything (wrong cwd, no repository, a CI checkout that did not
    fetch), this is the test that says so instead of the gate going quietly green."""
    files = tracked_files()
    assert len(files) >= 5, f"git ls-files returned {len(files)} paths: {files}"


def test_the_allowlist_is_not_a_single_catch_all() -> None:
    """A rule of `**` would satisfy every other test in this file while enforcing nothing."""
    assert len(ALLOW) >= 30, f"the allowlist has shrunk to {len(ALLOW)} rules"
    for rule in ALLOW:
        assert rule.pattern not in ("**", "*", "", "/"), f"catch-all rule: {rule.pattern!r}"
        assert len(rule.reason) > 15, f"rule {rule.pattern!r} has no real reason: {rule.reason!r}"


# ---------------------------------------------------------------------------------------------
# The gate
# ---------------------------------------------------------------------------------------------

def test_every_tracked_file_is_explicitly_allowed() -> None:
    missing = unlisted(tracked_files())
    assert not missing, (
        "These tracked files are not admitted by any rule in tools/publication_allowlist.py:\n  "
        + "\n  ".join(missing)
        + "\n\nThis is the allowlist working. Either the file should not be in this repository, or it "
        "should be added to ALLOW with a reason saying why it is safe to publish. Do not add a "
        "broader pattern to make this pass: the pattern that admits one new file also admits every "
        "future file beside it."
    )


def test_no_tracked_file_trips_the_second_net() -> None:
    hits = forbidden(tracked_files())
    assert not hits, (
        "These tracked files contain a forbidden path fragment:\n  "
        + "\n  ".join(f"{p}  (matched {n!r}: {why})" for p, n, why in hits)
        + "\n\nIf the allowlist admitted one of these, the allowlist has an over-broad pattern. Fix "
        "the pattern, not this list."
    )


# ---------------------------------------------------------------------------------------------
# Positive controls: one per category the brief names as never-publish
# ---------------------------------------------------------------------------------------------

FORBIDDEN_EXAMPLES: tuple[tuple[str, str], ...] = (
    ("ucl/simulator/engine.py", "Champions League engine"),
    ("web/src/components/ucl/kit/ClubChip.tsx", "Champions League UI"),
    ("web/src/app/(ucl)/ucl/methodology/page.tsx", "Champions League route group"),
    ("web/src/lib/ucl/crest.ts", "Champions League data layer"),
    ("tests/ucl/test_guard_audit.py", "Champions League tests"),
    ("cf/data/ucl_2026_27_entrants.json", "club-football data infrastructure"),
    ("tests/cf/test_match_id.py", "club-football tests"),
    ("web/src/app/(presaira)/presaira.css", "the landing page route group"),
    ("web/src/components/presaira/HeroField.tsx", "landing page components"),
    ("web/src/lib/presaira/data/sports.ts", "landing page data"),
    ("data/design_tokens.json", "carries Cold Light and the Champions League palette"),
    ("web/src/app/(presaira)/presaira-theme.css", "the Cold Light token stylesheet"),
    ("CLAUDE.md", "agent operating instructions"),
    ("HANDOFF.md", "agent session handoff"),
    ("docs/WAVE27_STATUS.md", "a status document"),
    ("docs/PRESAIRA_LANDING_W9_STATUS.md", "a status document"),
    ("docs/councils/WAVE27_D1_CALENDAR_COUNCIL.md", "an agent brief"),
    (".env", "an environment file"),
    (".env.local", "an environment file"),
    ("web/.env.local", "an environment file"),
)


def test_every_forbidden_example_is_rejected() -> None:
    """The single most important test in this repository.

    Each path below is real or realistic and each is something the brief says must never publish. A
    path is rejected if EITHER net catches it, and both are reported so a future reader can see which
    one did the work.
    """
    admitted = []
    for path, what in FORBIDDEN_EXAMPLES:
        rule = admitted_by(path)
        net2 = forbidden_reason(path)
        if rule is not None and net2 is None:
            admitted.append(f"{path} ({what}) was ADMITTED by rule {rule.pattern!r}")
    assert not admitted, "the allowlist would publish these:\n  " + "\n  ".join(admitted)


def test_each_forbidden_example_is_caught_by_at_least_the_allowlist_or_the_net() -> None:
    """Reports which net caught each one, so a reader can see the allowlist is doing most of the work
    and the substring list is genuinely a backstop rather than the mechanism."""
    by_allowlist, by_net = 0, 0
    for path, _ in FORBIDDEN_EXAMPLES:
        if admitted_by(path) is None:
            by_allowlist += 1
        elif forbidden_reason(path) is not None:
            by_net += 1
    assert by_allowlist + by_net == len(FORBIDDEN_EXAMPLES)
    assert by_allowlist >= len(FORBIDDEN_EXAMPLES) - 3, (
        f"only {by_allowlist} of {len(FORBIDDEN_EXAMPLES)} forbidden paths were stopped by the "
        "allowlist itself; the substring net is meant to be a backstop, not the mechanism"
    )


def test_every_forbidden_substring_actually_fires_on_something() -> None:
    """A substring nobody can trigger is decoration, and decoration in a safety list is worse than an
    empty list because it reads as coverage."""
    for needle, reason in FORBIDDEN_SUBSTRINGS:
        probe = f"some/path/{needle}/file.txt" if not needle.startswith(".") else f"some/path/{needle}"
        assert forbidden_reason(probe) is not None, (
            f"the forbidden substring {needle!r} ({reason}) does not fire on {probe!r}"
        )


# ---------------------------------------------------------------------------------------------
# Negative controls: the allowlist must still admit what it is for
# ---------------------------------------------------------------------------------------------

ALLOWED_EXAMPLES: tuple[str, ...] = (
    "model/dixon_coles.py",
    "model/elo.py",
    "model/dixon_coles_params.json",
    "simulator/engine.py",
    "simulator/tiebreakers.py",
    "data/backtest/wc2026_calibration.json",
    "data/backtest/reliability_2018.csv",
    "data/backtest/reliability_2022.csv",
    "data/backtest/wc2022_retro_metrics.json",
    "data/tournament_structure_2026.json",
    "tests/test_dixon_coles.py",
    "tests/test_tiebreakers_order.py",
    "web/src/app/(wc)/methodology/page.tsx",
    "web/src/components/methodology/ReliabilityChart.tsx",
    "web/public/methodology/reliability_2026.csv",
    "README.md",
    "docs/model_card.md",
)


def test_the_allowlist_admits_what_it_is_for() -> None:
    """Without this, an allowlist of nothing passes every test above."""
    rejected = [p for p in ALLOWED_EXAMPLES if admitted_by(p) is None]
    assert not rejected, "the allowlist rejects files it is supposed to publish:\n  " + "\n  ".join(rejected)
    tripped = forbidden(ALLOWED_EXAMPLES)
    assert not tripped, "the second net rejects legitimate files:\n  " + "\n  ".join(str(t) for t in tripped)


def test_a_single_star_does_not_cross_a_directory_separator() -> None:
    """The bug this would otherwise have. `tests/*.py` must admit tests/test_elo.py and must NOT admit
    tests/ucl/test_guard_audit.py. fnmatch alone does not make that distinction, so the segment count
    is checked as well, and this pins that it works."""
    assert admitted_by("tests/test_elo.py") is not None
    assert admitted_by("tests/ucl/test_guard_audit.py") is None
    assert admitted_by("web/src/lib/stage.ts") is not None
    assert admitted_by("web/src/lib/ucl/crest.ts") is None


def test_a_leading_dot_survives_normalisation() -> None:
    """REGRESSION. `_norm` once used `str.lstrip("./")`, which strips a character SET and not a
    prefix, so every dotfile lost its leading dot: `.env` became `env`.

    Both ends are pinned. The benign end: `.gitignore` must be admitted. The dangerous end: a bare
    `.env` at the root must trip the substring net ON ITS OWN, without relying on the allowlist also
    rejecting it, because the net exists for the case where the allowlist has been written too
    broadly.
    """
    assert admitted_by(".gitignore") is not None, "a dotfile lost its leading dot again"
    assert admitted_by(".gitattributes") is not None
    assert admitted_by(".github/workflows/ci.yml") is not None
    for env in (".env", ".env.local", ".env.production"):
        hit = forbidden_reason(env)
        assert hit is not None, f"the credential tripwire did not fire on a bare {env!r}"
        assert hit[0] == ".env", hit


def test_a_new_unlisted_directory_fails_closed() -> None:
    """The property the whole design is for: a directory nobody thought of is rejected by default."""
    for invented in (
        "web/src/components/formula1/Grid.tsx",
        "web/src/lib/nba/standings.ts",
        "business/monetisation_plan.md",
        "brand/unreleased_identity.pdf",
        "scripts/agent_brief_generator.py",
    ):
        assert admitted_by(invented) is None, f"an invented path was admitted: {invented}"

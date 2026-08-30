"""What may exist in this repository, stated positively. Nothing publishes unless it is listed here.

WHY POSITIVE AND NOT NEGATIVE. This repository is an extract from a private one that also holds
business strategy, unreleased brand systems, competitor-sensitive planning, and the operating
instructions for the agents that build it. A denylist protects you against the leaks you thought of.
The next directory somebody adds is, by construction, one you did not think of, and a denylist admits
it silently. An allowlist rejects it just as silently, and rejection is the safe direction.

So the rule enforced by tools/test_publication_allowlist.py is: every tracked file must be admitted by
a pattern below, or the build fails and names the file.

TWO NETS, AND THE SECOND IS NOT A DENYLIST REPLACING THE FIRST. A prefix pattern can OVER-admit: write
`web/src/lib/**` and you have just published `web/src/lib/ucl/`. So there is a second, independent
check over a small set of substrings that must never appear in a published path at all. It is not the
mechanism, it is the tripwire that catches the mechanism being written carelessly, and the test suite
proves it fires by planting each one.

WHAT THIS FILE CANNOT DO. It reasons about PATHS. A business-sensitive sentence inside an allowed
source file is invisible to it. That is a separate sweep, run over content, and its findings are
recorded in README.md under "What is deliberately not here".
"""
from __future__ import annotations

import fnmatch
from typing import Iterable, NamedTuple


class Rule(NamedTuple):
    pattern: str
    reason: str


# ---------------------------------------------------------------------------------------------
# The model and the simulator: the engine itself
# ---------------------------------------------------------------------------------------------
_ENGINE: tuple[Rule, ...] = (
    Rule("model/**", "the Dixon-Coles goal model, the Elo rating system, the fits they produce, and "
                     "the backtest harnesses that scored them"),
    Rule("simulator/**", "the Monte Carlo engine, the tie-breaker chain, group projection and the "
                         "projected bracket"),
)

# ---------------------------------------------------------------------------------------------
# The data the model reads, and the artifacts it produced
# ---------------------------------------------------------------------------------------------
# ENUMERATED ONE BY ONE rather than `data/**`, because data/ in the private repository also holds
# design_tokens.json (which carries an unreleased brand system) and a corpus tree belonging to a
# different competition. A directory glob here would publish both.
_DATA: tuple[Rule, ...] = (
    Rule("data/tournament_structure_2026.json", "the bracket the simulator walks"),
    Rule("data/knockout_slots_2026.json", "knockout slot wiring"),
    Rule("data/third_place_matrix_2026.json", "FIFA's third-place qualification matrix"),
    Rule("data/third_place_matrix_2026.README.md", "how that matrix was derived"),
    Rule("data/group_rules_2026.json", "the Article 13 tie-break chain as data"),
    Rule("data/groups_2026.csv", "group composition"),
    Rule("data/fixtures_2026.csv", "the fixture list"),
    Rule("data/teams_2026.csv", "the 48 team field"),
    Rule("data/venues_2026.json", "venues, used for the altitude and travel factors"),
    Rule("data/team_home_altitude.csv", "altitude factor input"),
    Rule("data/fifa_ranking_2026.json", "the pre-tournament ranking snapshot"),
    Rule("data/fifa_rankings_history.csv", "ranking history used by the Elo prior"),
    Rule("data/historical_results_clean.csv", "the cleaned international results corpus the fit uses"),
    Rule("data/data_manifest.json", "provenance for every file above"),
    # NAMED ONE BY ONE. `data/backtest/**` was the fourth prefix glob in this file to over-admit. It
    # published the player-model ablation study: four 28 KB prediction CSVs, a metrics file and the
    # actual-goals input, none of it read by anything here, because the player model itself
    # (players/) does not publish. One of those files also carried a provenance note pointing at two
    # directories that do not exist in this repository.
    #
    # Four for four. Every prefix glob written in this file admitted something it should not have:
    # docs/** took 32 status documents and agent briefs, tests/*.py took five suites that cannot
    # import, web/src/lib/*.ts took the product roadmap, and this one took the ablation study. The
    # pattern is not carelessness, it is that a prefix describes a place rather than a set, and
    # places acquire new contents.
    Rule("data/backtest/wc2026_calibration.json", "the 2026 calibration assessment: the Platt and isotonic verdicts and the reliability bins"),
    Rule("data/backtest/reliability_2018.csv", "the 2018 held-out reliability bins the methodology diagram renders"),
    Rule("data/backtest/reliability_2022.csv", "the 2022 tuned reliability bins the methodology diagram renders"),
    Rule("data/backtest/wc2022_retro_metrics.json", "the in-tournament walk-forward retrodiction scores"),
    Rule("data/backtest/wc2022_retro_predictions.csv", "the per-match predictions behind those scores"),
    Rule("data/backtest/convergence.json", "the 25k versus 50k Monte Carlo convergence check the publish gate requires"),
    Rule("data/backtest/final_results.json", "the scored outcome set the backtests grade against"),
    Rule("data/backtest/tuning_2022.json", "the eight-step coordinate-descent trajectory the methodology page tabulates"),
    Rule("data/backtest/wc2018_champion_odds.json", "pre-tournament champion odds, 2018"),
    Rule("data/backtest/wc2022_champion_odds.json", "pre-tournament champion odds, 2022"),
    Rule("data/backtest/wc2018_champion_convergence.json", "walk-forward champion convergence, 2018"),
    Rule("data/backtest/wc2022_champion_convergence.json", "walk-forward champion convergence, 2022"),
    Rule("data/backtest/wc2018_predictions.csv", "per-match predictions, 2018 held-out backtest"),
    Rule("data/backtest/wc2022_predictions.csv", "per-match predictions, 2022 tuned backtest"),
    Rule("data/backtest/wc2022_coverage_report.json", "coverage of the 2022 backtest, so the sample is checkable"),
)

# ---------------------------------------------------------------------------------------------
# The tests and guards that gate the engine
# ---------------------------------------------------------------------------------------------
# `tests/*.py` is a SINGLE LEVEL glob on purpose. tests/ in the private repository also holds
# tests/ucl/, tests/cf/ (club-football data infrastructure for the other competition) and tests/db/
# (the Supabase pipeline, which is not published). `tests/**` would take all three.
# NAMED ONE BY ONE, and `tests/*.py` was the first attempt. It admitted 16 modules, and FIVE of them
# do not import on a clean checkout: four need `players/` and one needs `db/`, neither of which
# publishes. A published suite that cannot collect is worse than a smaller one, because the first
# thing an evaluator does is run it.
#
# A SIXTH was dropped later, and by a different route worth recording. The dependency scan that found
# the first five looked for `import` statements. tests/test_locked_pretournament.py has none: it loads
# scripts/gen_locked_pretournament.py BY PATH through importlib.util.spec_from_file_location, so no
# scan of imports could see it, and it failed only when the suite was actually run from a clean
# checkout. Publishing the generator did not fix it either, because the generator reads
# players/artifacts/player_projections.json, and the player model does not publish.
#
# The lesson is narrow and worth keeping: a dependency expressed as a path is invisible to a
# dependency scan, and the only thing that finds it is running the suite somewhere the file is absent.
#
# The six dropped suites are not hidden: README.md names them and says which private module each needs.
_PUBLISHED_TESTS = (
    "test_backtest.py", "test_backtest_hosts.py", "test_backtest_retro.py",
    "test_calibration_backtest.py", "test_champion_convergence.py", "test_champion_odds.py",
    "test_dixon_coles.py", "test_elo.py",
    "test_projected_bracket.py", "test_simulator_shell.py", "test_tiebreakers_order.py",
)
_TESTS: tuple[Rule, ...] = tuple(
    Rule(f"tests/{name}", "a model or simulator suite that runs on a clean checkout of THIS repository")
    for name in _PUBLISHED_TESTS
) + (
    Rule("tests/conftest.py", "pytest configuration for the suites above"),
    Rule("tests/fixtures/**", "recorded fixtures those suites read"),
    Rule("scripts/calibration_backtest.py", "the calibration core the methodology page's Platt and "
                                            "isotonic verdicts came from. compute_calibration is a "
                                            "pure function of its inputs and imports only numpy and "
                                            "model.metrics; the database path lives in main() and is "
                                            "not exercised by the published suite"),
)

# ---------------------------------------------------------------------------------------------
# The site
# ---------------------------------------------------------------------------------------------
# Every component and lib directory is named individually. `web/src/components/**` would publish
# web/src/components/ucl/ (88 files) and `web/src/lib/**` would publish web/src/lib/ucl/ (51 files).
# Naming them one at a time is the only shape where a NEW directory fails closed.
_SITE_DIRS = (
    "admin", "bracket", "brand", "daily", "dashboard", "forecast", "groups", "humans", "home",
    "layout", "match", "matches", "methodology", "players", "predict", "strip", "teams", "ui",
)
_LIB_DIRS = ("cron", "data", "http", "players", "supabase", "types")
_API_ROUTES = (
    "admin/route.ts", "admin/player-stats/route.ts", "cron/tick/route.ts", "health/route.ts",
    "health/freshness/route.ts", "live-run/route.ts", "match/[matchId]/route.ts",
    "predict/route.ts", "revalidate/route.ts",
)

_SITE: tuple[Rule, ...] = (
    (
        Rule("web/src/app/(wc)/**", "the World Cup route group, including the methodology page source"),
        Rule("web/src/app/favicon.ico", "site chrome: the browser tab icon"),
        Rule("web/src/app/icon.svg", "site chrome: the app icon Next.js serves"),
        Rule("web/src/app/globals.css", "site chrome: the base stylesheet every page loads"),
        Rule("web/src/app/global-not-found.tsx", "site chrome: the 404 page"),
        # robots.ts and sitemap.ts are DELIBERATELY ABSENT, and this comment is where that decision
        # lives so nobody re-adds them without reading it. Both import from lib/ucl: sitemap.ts pulls
        # entitySitemap, reveal and routes, and robots.ts pulls reveal. They enumerate the routes of
        # BOTH competitions from one place, so they cannot be published without either dragging in
        # the Champions League tree or being rewritten into a file the private repository does not
        # have. Dropping them costs this extract a generated robots.txt and sitemap.xml, which the
        # live deployment produces from the private repository anyway. Measured: they were the only
        # two files in 223 published ts/tsx with an import that does not resolve here.
        Rule("web/src/components/ThemeToggle.tsx", "shared chrome: the light and dark switch"),
        # NAMED ONE BY ONE. `web/src/lib/*.ts` was the third prefix glob in this file to over-admit,
        # and it was the worst of the three. It admitted web/src/lib/tournaments.ts, which is a
        # complete product roadmap: seven tournaments with slugs, route prefixes and theme keys, one
        # marked "live", one "dark" and FIVE "planned", plus a header comment naming the data layer
        # the planned ones are meant to run on. Nothing in the published set imports it. A glob that
        # reads as "the small shared helpers" published the expansion plan.
        #
        # web/src/lib/groupWhy.ts is also absent: it is imported by nothing here either, and an
        # unused file in a published extract is a file nobody will maintain and everybody will read.
        # Every entry below was verified to be imported by at least one published module.
        Rule("web/src/lib/actualTier.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/bracketFill.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/calendar.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/data.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/flagColors.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/flags.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/fonts.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/matchday.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/nav.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/players.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/stage.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/teamCodes.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/teamElo.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/teamSlug.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/types.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/utils.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/venueTz.ts", "a shared helper the published site imports"),
        Rule("web/src/lib/whyLine.ts", "a shared helper the published site imports"),
        Rule("web/public/*.svg", "static assets shipped with the Next.js starter"),
        Rule("web/public/methodology/**", "the reliability CSVs the methodology page renders from"),
        Rule("web/.gitignore", "build configuration: needed to install and build the site"),
        Rule("web/README.md", "build configuration: needed to install and build the site"),
        Rule("web/eslint.config.mjs", "build configuration: needed to install and build the site"),
        Rule("web/next.config.ts", "build configuration: needed to install and build the site"),
        Rule("web/package.json", "build configuration: needed to install and build the site"),
        Rule("web/package-lock.json", "build configuration: needed to install and build the site"),
        Rule("web/postcss.config.mjs", "build configuration: needed to install and build the site"),
        Rule("web/tsconfig.json", "build configuration: needed to install and build the site"),
    )
    + tuple(Rule(f"web/src/components/{d}/**", f"World Cup site UI, the {d} components") for d in _SITE_DIRS)
    + tuple(Rule(f"web/src/lib/{d}/**", f"World Cup site data layer, lib/{d}") for d in _LIB_DIRS)
    + tuple(Rule(f"web/src/app/api/{r}", "a World Cup API route, named individually so a new route fails closed") for r in _API_ROUTES)
)

# ---------------------------------------------------------------------------------------------
# Repository-level files
# ---------------------------------------------------------------------------------------------
_ROOT: tuple[Rule, ...] = (
    Rule("README.md", "the entry point, and the artifact a technical reader checks first"),
    Rule("LICENSE", "the licence this repository is published under"),
    Rule(".gitignore", "repository hygiene: keeps build output and environment files untracked"),
    Rule(".gitattributes", "line-ending normalisation"),
    Rule("requirements.txt", "pinned Python dependencies"),
    # NAMED ONE BY ONE, and the first version of this rule was `docs/**`, which was WRONG in a way
    # worth recording. The intent was "docs/ in THIS repository is authored for publication". But the
    # extractor copies FROM the private tree, so `docs/**` reached into a docs/ directory holding 30
    # wave status documents and 2 agent council briefs, and admitted all 32. The second net caught it
    # on the first real run and the extraction aborted before writing anything.
    #
    # The lesson is the one this file's own docstring states and then nearly violated: a prefix
    # pattern admits everything that will ever sit under it, including files that do not exist yet
    # and files in a tree you were not thinking about. Every document here is authored in this
    # repository, for a reader outside it, and none is a copy of a private one.
    Rule("docs/model_card.md", "what the model is, what it was fit on, how it was evaluated, and "
                               "where it is known to be weak"),
    Rule("docs/pre_registered_gates.md", "the gates that were committed before any result existed, "
                                         "and the instances where one refused to fire"),
    Rule("docs/wc2026_postmortem.md", "how the model actually did across the 2026 tournament, "
                                      "including the direction in which it missed"),
    Rule("docs/incidents.md", "the enumeration: plausible things that turned out to be wrong, how "
                              "long each survived, and what caught it"),
    Rule("docs/reproducing_a_published_number.md", "the reproducibility block and the exact steps "
                                                   "from a clean checkout to a published figure"),
    Rule("tools/**", "this allowlist and the test suite that enforces it on every push"),
    Rule(".github/workflows/*.yml", "the CI that enforces the allowlist and runs the suites"),
)

ALLOW: tuple[Rule, ...] = _ENGINE + _DATA + _TESTS + _SITE + _ROOT


# ---------------------------------------------------------------------------------------------
# Authored here, never copied
# ---------------------------------------------------------------------------------------------
# These paths are allowlisted (they belong in this repository) but they must NEVER be copied from the
# private tree, because a file of the same name exists there and says something else.
#
# RECORDED BECAUSE IT ALREADY HAPPENED. The first extraction run copied the private README.md straight
# over the authored one. The private README is written for someone with the whole tree: it documents
# db/, players/, scripts/ and runbook.md, none of which publish, so every one of those references
# would have been a dead link in a public repository, and the file also carries brand positioning
# written for an internal audience. The allowlist was right that README.md belongs here. It was the
# extractor that had no way to know which README.
AUTHORED_IN_THIS_REPOSITORY: frozenset[str] = frozenset({
    "README.md",
    ".gitignore",
    ".gitattributes",
    "docs/model_card.md",
    "docs/pre_registered_gates.md",
    "docs/wc2026_postmortem.md",
    "docs/incidents.md",
    "docs/reproducing_a_published_number.md",
    "tools/publication_allowlist.py",
    "tools/test_publication_allowlist.py",
    "tools/__init__.py",
    ".github/workflows/ci.yml",
})


# ---------------------------------------------------------------------------------------------
# The second net
# ---------------------------------------------------------------------------------------------
# Substrings that must never appear in a published path, whatever the allowlist says. This exists
# because a prefix pattern can over-admit, not because a denylist is the mechanism. Each entry is
# proved to fire by tools/test_publication_allowlist.py.
FORBIDDEN_SUBSTRINGS: tuple[tuple[str, str], ...] = (
    ("/ucl/", "the Champions League workstream does not publish"),
    ("ucl/", "the Champions League workstream does not publish"),
    ("/cf/", "club-football data infrastructure belongs to the Champions League workstream"),
    ("(presaira)", "the landing page route group does not publish"),
    ("presaira/", "landing page sources do not publish"),
    ("cold_light", "the Cold Light token system is an unreleased brand system"),
    ("coldLight", "the Cold Light token system is an unreleased brand system"),
    ("CLAUDE.md", "agent operating instructions do not publish"),
    ("HANDOFF.md", "agent session handoff does not publish"),
    ("_STATUS.md", "status documents do not publish"),
    ("WAVE", "wave status documents and agent briefs do not publish"),
    ("design_tokens.json", "carries the Cold Light and Champions League palettes"),
    (".env", "no environment file, ever"),
)


def _norm(path: str) -> str:
    """Backslashes to forward slashes, and a leading `./` removed.

    THE BUG THIS REPLACES WAS A SAFETY BUG, not a cosmetic one, and it is recorded because the shape
    recurs. It read `.lstrip("./")`. `str.lstrip` strips any leading character present in the SET
    "./", not the prefix "./". So `.env` normalised to `env`, `.gitignore` to `gitignore`, and
    `.github/workflows/ci.yml` to `github/workflows/ci.yml`.

    The consequence: `forbidden_reason(".env")` looked for the substring ".env" in "env" and did not
    find it. A bare `.env` at the repository root would not have tripped the credential tripwire at
    all. It was still rejected, because the allowlist does not admit it either, but the second net
    exists precisely for the case where the first one has been written too broadly, and a backstop
    that silently does not fire is worse than no backstop.

    It was caught by the allowlist enforcement failing on `.gitignore`, a file that is obviously
    allowed, which is the benign end of the same defect. `test_a_leading_dot_survives_normalisation`
    pins both ends.
    """
    p = path.replace("\\", "/")
    while p.startswith("./"):
        p = p[2:]
    return p


def admitted_by(path: str) -> Rule | None:
    """The rule that admits `path`, or None. `**` matches across separators, `*` does not.

    fnmatch does not distinguish the two, so `**` is translated to a wildcard and `*` is required to
    stay inside one segment by checking the segment count. Without that, `tests/*.py` would admit
    tests/ucl/test_anything.py, which is exactly the leak this file exists to stop.
    """
    p = _norm(path)
    for rule in ALLOW:
        pat = rule.pattern
        if pat.endswith("/**"):
            if p.startswith(pat[:-2]):
                return rule
        elif "*" in pat:
            if fnmatch.fnmatch(p, pat) and p.count("/") == pat.count("/"):
                return rule
        elif p == pat:
            return rule
    return None


def forbidden_reason(path: str) -> tuple[str, str] | None:
    """The first forbidden substring in `path`, if any. Case-sensitive except where the entry is
    obviously a filename, which is handled by listing both spellings above."""
    p = _norm(path)
    for needle, reason in FORBIDDEN_SUBSTRINGS:
        if needle in p:
            return needle, reason
    return None


def unlisted(paths: Iterable[str]) -> list[str]:
    return [p for p in paths if admitted_by(p) is None]


def forbidden(paths: Iterable[str]) -> list[tuple[str, str, str]]:
    out = []
    for p in paths:
        hit = forbidden_reason(p)
        if hit:
            out.append((p, hit[0], hit[1]))
    return out

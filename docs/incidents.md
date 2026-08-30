# Incidents

Things that were plausible and turned out to be wrong. Each entry names what was believed, why it was
believable, how long it survived, and what finally caught it. The last of those is the useful part: a
list of bugs teaches nothing, a list of what caught them teaches where to put the next check.

Everything below is checkable inside this repository. Incidents from workstreams that are not
published here are not described, because a claim you cannot check is not evidence.

---

## 1. Four prefix globs, four leaks, in the file whose whole job was to stop leaks

**Believed.** `tools/publication_allowlist.py` decides what may exist in this public repository. Its
own docstring argues, at length, that a denylist is unsafe because the next directory somebody adds is
by construction one you did not think of. It then used prefix globs to describe the allowed set.

**Why that was believable.** A prefix reads like a description of a place you know. `docs/**` reads as
"the documentation". `tests/*.py` reads as "the tests". `web/src/lib/*.ts` reads as "the small shared
helpers".

**What happened.** All four globs admitted something they should not have, and each was caught by a
different mechanism:

| glob | what it admitted | caught by |
|---|---|---|
| `docs/**` | 30 internal status documents and 2 working briefs | the second net, on the first extraction run |
| `tests/*.py` | five suites that cannot import without unpublished modules | running the suite |
| `web/src/lib/*.ts` | the product roadmap: seven verticals with route prefixes, one live, one unreleased, five planned | reading the file list by hand |
| `data/backtest/**` | a player-model ablation study whose code does not publish | grepping published content for cross-tree references |

**The lesson, and it is not "be careful".** A prefix describes a *place*, and places acquire new
contents. The allowlist now names files and single directories individually, and every entry carries
the reason it is safe. The one property that survived all four is that **rejection is the safe
direction**: each leak was caught, none reached a commit, because the default was no.

**What caught it in the end.** The second net, in `tools/publication_allowlist.py`, is a small list of
substrings that must never appear in a published path. It is explicitly not the mechanism, it exists
for exactly the case where the mechanism has been written too broadly, and that case arrived on the
first run.

---

## 2. The tripwire that could not fire on the thing it was named after

**Believed.** The substring net catches a bare `.env` at the repository root.

**Why that was believable.** `.env` is in the list, with a reason attached, and a test asserted that
every entry in the list fires on a probe path.

**What was actually true.** Path normalisation read `path.lstrip("./")`. `str.lstrip` strips any
leading character in the *set* `"./"`, not the prefix `"./"`. So `.env` normalised to `env`, and the
search for the substring `.env` in `env` found nothing. `.gitignore` became `gitignore` and
`.github/workflows/ci.yml` became `github/workflows/ci.yml`.

**How long it survived.** From the file being written to the first time the allowlist ran against a
real tree, which is minutes rather than months, but it survived its own test suite. The test that
should have caught it built its probe as `some/path/.env`, where the leading dot is not leading.

**What caught it.** The benign end of the same bug. The allowlist enforcement failed on `.gitignore`,
a file that is obviously allowed. Chasing why a legitimate file was rejected found the reason a
dangerous one would not have been.

**Now pinned** by `test_a_leading_dot_survives_normalisation` in
`tools/test_publication_allowlist.py`, which asserts both ends: `.gitignore` is admitted, and `.env`
trips the net *on its own*, without relying on the allowlist also rejecting it.

---

## 3. A redirect is not a configuration

**Believed.** The private repository was renamed. GitHub redirects the old path, so every clone,
remote and reference keeps working.

**Why that was believable.** It is true, and it stayed true right up until it stopped.

**What happened.** A new, empty repository was created at the old path, to keep a URL that had already
been sent to someone alive. A rename redirect stops redirecting the moment the old name is occupied.
Every remote still pointing at the old path silently began resolving to the new empty repository
instead of the renamed one.

**Why it mattered more than it looks.** The consequence was not a failed fetch, which is loud. It was
that a push would have gone to the wrong repository, and one production code path held the old path as
a hardcoded constant: a dispatch to a repository with no workflows is accepted and runs nothing, so
the failure reports success.

**What caught it.** Comparing what the URL actually served against what it was supposed to serve,
rather than checking that it served something. `git ls-remote` on both paths returned two different
repositories.

**Trace in this repository.** `web/src/lib/data/events.ts` reads its dispatch target from the
environment. The comment above that block is the write-up.

---

## 4. A test that checks the right answer does not check the ordering

**Believed.** The group tie-break chain was correct, because tests asserted the right team finishes
first.

**Why that was believable.** Every test passed, on real inputs, with the correct winner.

**What was actually true.** An adapter that silently reorders a sort key passes every unit test that
only checks "the right team wins" on decisive inputs, because on a decisive input several orderings
agree. The FIFA Article 13 chain applies head-to-head among the tied teams *before* overall goal
difference, and a chain that had those two the other way round would have produced identical results
on almost every real group.

**What caught it.** A sibling session finding, recorded in the docstring of
`tests/test_tiebreakers_order.py`. The fix was not a bug fix, it was a different kind of test:
construct groups where every criterion but one is level, or points the other way, so that a reordered
chain *fails* rather than merely producing a different winner.

---

## 5. A convergence check that did not pass, published as not passing

**Not a mistake, and it is here because the absence of an entry like this is what makes an incident
list unbelievable.**

`data/backtest/convergence.json` records a Monte Carlo convergence check comparing champion
probabilities at 10,000 and 50,000 iterations against a 0.5 percentage point target. It reads
`"pass": false`. The top team differs by 0.634 points.

The file names the team, both figures, the reason (Monte Carlo noise on the largest probability), and
the remedy (production runs at 50,000 iterations, which the published forecast does). It was not
deleted, rerun until green, or moved out of the repository. It is the answer the check gave.

---

## 6. The direction of a miss is a different claim from the size of it

**Believed, and stated in writing to an external reader.** That the methodology page "plainly states
where the model was overconfident".

**What was actually true.** The page said the reliability was mixed and attributed the worst bin to a
single-match sample. Both true, neither directional. And the direction, once someone read the bins the
page already rendered, was the other way: the model was **under-confident**. Its home-win and away-win
probabilities sat too close to the middle of the range.

**What caught it.** Reading the published bins instead of the published prose.

**What the fix deliberately did not do.** It did not fit a line. The direction is
estimator-dependent: a weighted least-squares slope with an intercept and a ratio of weighted means
disagree on magnitude, and on draws they disagree on sign. So the page quotes the bins themselves,
which need no such choice, and says explicitly that draws are excluded from the directional claim
because 81 of 104 observations fall in one of their three populated bins. See
`docs/wc2026_postmortem.md`.

// The /matches fixture list as collapsible, round-aware sections. Every section is a native
// <details> disclosure (deterministic SSR, accessible, keyboard-operable, no client JS needed for
// open/close) that is COLLAPSED by default and expands into the full list of that round's matches.
//
// Section order is fixed (bracket order): Played, Group stage, Round of 32, Round of 16,
// Quarter-finals, Semi-finals, Final. The third-place play-off is a real stage that sits just
// before the Final; its fixtures are folded into the Final section's list so the seven-section
// order the page promises holds without dropping any fixture.
//
// EVERYTHING is computed from the same live fixtures/results/probabilities the rest of the site
// reads, against a single server "now" reference passed in (never a per-render `new Date()`), so
// SSR is stable and the page advances on its own: as matches finish, Played grows and the group
// stage's nearest-upcoming rolls forward; as a knockout round's pairings resolve and get scheduled,
// that section lights up from its quiet placeholder into the live nearest-upcoming match.

import { FixtureGlanceTile } from "@/components/match/FixtureGlanceTile";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { LocalKickoff } from "@/components/ui/LocalKickoff";
import { teamCode } from "@/lib/teamCodes";
import { simPct } from "@/lib/utils";
import { stageLabel } from "@/lib/stage";
import type { DailyFixture } from "@/lib/data/daily";
import type { Stage } from "@/lib/types";

// Bracket order for grouping the Played recap by stage. The Played section grows with every finished
// match across ALL rounds, so inside it we separate group results from each knockout round (and the
// third-place play-off, which sits just before the Final) rather than showing one flat list.
const PLAYED_STAGE_ORDER: Stage[] = [
  "group", "round_of_32", "round_of_16", "quarter_finals",
  "semi_finals", "third_place_playoff", "final",
];

// The Played recap renders NEWEST-FIRST: the latest-played stage leads (Final/third-place, ..., down
// to Group stage), so the freshest results are at the top when expanded with no scrolling. Within
// each stage the tiles are sorted by kickoff DESCENDING (see PlayedByStage). The collapsed header
// still shows the single most-recent match (unchanged).
const PLAYED_STAGE_ORDER_NEWEST_FIRST: Stage[] = [...PLAYED_STAGE_ORDER].reverse();

// The knockout rounds, in the order their sections appear after Played and the group stage. The
// placeholder copy answers "why is this round empty yet?" with the gate it is waiting on.
const KO_SECTIONS: { stage: Stage; label: string; placeholder: string }[] = [
  { stage: "round_of_32", label: "Round of 32", placeholder: "Begins after the group stage" },
  { stage: "round_of_16", label: "Round of 16", placeholder: "Begins after the Round of 32" },
  { stage: "quarter_finals", label: "Quarter-Finals", placeholder: "Begins after the Round of 16" },
  { stage: "semi_finals", label: "Semi-Finals", placeholder: "Begins after the Quarter-Finals" },
  { stage: "final", label: "Final", placeholder: "Begins after the Semi-Finals" },
];

/** Order within a section: by kickoff time, then match number as a stable tiebreaker. A fixture
 *  with no kickoff sorts last (its key is the empty string, which is the smallest, so flip it). */
function byKickoff(a: DailyFixture, b: DailyFixture): number {
  const ka = a.kickoff_utc ?? "￿";
  const kb = b.kickoff_utc ?? "￿";
  return ka === kb ? a.match_no - b.match_no : ka.localeCompare(kb);
}

/** A fixture is "scheduled and resolvable" for summary purposes when it has a real kickoff and is
 *  not finished. Knockout slots with no resolved teams still have a kickoff and render fine. */
function isUpcoming(f: DailyFixture): boolean {
  return !f.finished && Boolean(f.kickoff_utc);
}

/** The nearest upcoming fixture in a list: the minimum kickoff among scheduled, not-finished
 *  fixtures at or after `nowISO`. If none remain in the future, fall back to the earliest
 *  not-finished fixture (e.g. a kickoff slightly in the past but no result yet). Deterministic:
 *  it reads only the data + the single server reference. */
function nearestUpcoming(matches: DailyFixture[], nowISO: string): DailyFixture | null {
  const upcoming = matches.filter(isUpcoming).sort(byKickoff);
  if (upcoming.length === 0) return null;
  const future = upcoming.find((f) => (f.kickoff_utc as string) >= nowISO);
  return future ?? upcoming[0];
}

/** The most recent completed fixture: the maximum kickoff among finished fixtures. */
function mostRecentPlayed(matches: DailyFixture[]): DailyFixture | null {
  const played = matches.filter((f) => f.finished).sort(byKickoff);
  return played.length ? played[played.length - 1] : null;
}

/** A team's display for the COLLAPSED section summary (the representative row): flag + the FIFA
 *  three-letter trigram, never the full name. The trigram is fixed-width-ish and short, so the
 *  matchup never truncates into an ellipsis ("Urug...", "Cape Ve...") at the phone base width.
 *  (The expanded tiles below use their own trigram-based layout; /groups keeps full names. The
 *  /matches summary trigram is the deliberate opposite.) Unresolved knockout slots read "TBC". */
function TeamCodeInline({ name }: { name: string | null }) {
  if (!name) return <span className="text-muted">TBC</span>;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <Flag team={name} size="text-base" link={false} />
      <span className="font-semibold tracking-wide">{teamCode(name)}</span>
    </span>
  );
}

/** A compact one-line prediction for the collapsed summary: the favoured side's win chance, or a
 *  toss-up tag when the two sides are within a hair. Returns null when no run is published. */
function MiniPrediction({ f }: { f: DailyFixture }) {
  const pa = f.probs?.p_team_a_win ?? null;
  const pb = f.probs?.p_team_b_win ?? null;
  if (pa == null || pb == null) return null;
  const margin = Math.abs(pa - pb);
  if (margin < 0.05) {
    return <Tag variant="upset">Toss-up</Tag>;
  }
  const favName = pa > pb ? f.team_a : f.team_b;
  const favPct = Math.max(pa, pb);
  return (
    <span className="tnum inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-secondary">
      <span className="font-semibold text-confident">{favName ? teamCode(favName) : "Fav"}</span>
      <span>{simPct(favPct, 0)}</span>
    </span>
  );
}

/** The collapsed summary line for a populated section: nearest-upcoming match (teams + kickoff +
 *  the model's prediction) when one exists, otherwise the most recent result (teams + score). This
 *  is what the user sees before expanding, so it is never blank for a populated round. */
function PopulatedSummary({
  nearest,
  latest,
}: {
  nearest: DailyFixture | null;
  latest: DailyFixture | null;
}) {
  const f = nearest ?? latest;
  if (!f) return null;
  const showResult = !nearest && latest != null;

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="flex shrink-0 items-center gap-2 text-sm text-fg">
        <TeamCodeInline name={f.team_a} />
        <span className="shrink-0 text-[11px] text-muted">vs</span>
        <TeamCodeInline name={f.team_b} />
      </span>
      {showResult && f.result ? (
        <span className="flex shrink-0 items-center text-xs">
          <span className="tnum font-semibold text-fg">
            {f.result.a}-{f.result.b}
          </span>
        </span>
      ) : (
        // Kickoff datetime AND the model's odds on a SINGLE line beneath the matchup: small font,
        // tabular nums, no wrap, so the pair stays one readable line down to ~390px.
        <span className="flex min-w-0 shrink items-center gap-2 text-xs whitespace-nowrap">
          <LocalKickoff iso={f.kickoff_utc} className="tnum text-muted" />
          <MiniPrediction f={f} />
        </span>
      )}
    </span>
  );
}

/** A round-aware collapsible section: a native <details> whose <summary> carries the informative
 *  collapsed state and whose body is the full match list. `defaultOpen` only sets the server-
 *  rendered initial state (so SSR stays deterministic); the browser then owns the toggle. */
function Section({
  label,
  count,
  defaultOpen,
  summary,
  children,
}: {
  label: string;
  count: number;
  defaultOpen: boolean;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group overflow-hidden rounded-card border border-border bg-surface"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 transition hover:bg-elevated sm:px-4 [&::-webkit-details-marker]:hidden">
        {/* heading + count */}
        <span className="flex w-28 shrink-0 flex-col leading-tight sm:w-40">
          <span className="text-xs font-semibold tracking-wide text-secondary uppercase">{label}</span>
          <span className="tnum text-[11px] text-muted">
            {count} {count === 1 ? "match" : "matches"}
          </span>
        </span>

        {/* collapsed summary (informative, never blank) */}
        <span className="flex min-w-0 flex-1 items-center">{summary}</span>

        {/* disclosure chevron: rotates via the open state, no client JS */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="shrink-0 text-muted transition-transform group-open:rotate-180"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>

      <div className="border-t border-border px-3 py-3 sm:px-4">{children}</div>
    </details>
  );
}

/** The full match list for an expanded section, as a TWO-UP grid of the shared compact glance tile
 *  (FixtureGlanceTile). The tile carries the glance set only (kickoff/score, teams, the thin
 *  win/draw/loss bar + fav%); the heavy detail (full odds blocks, venue, stage tags) lives one tap
 *  away on /match/[id]. Two-up at the phone base breakpoint, stepping up with the viewport. It
 *  handles every DailyFixture shape: resolved teams (upcoming or finished) and undetermined
 *  knockout slots (a non-link placeholder tile, never a dead-end tap). */
function MatchList({ matches }: { matches: DailyFixture[] }) {
  return (
    // Two-up at the phone base, stepping up to 3 at lg and 4 at xl (Played / Group / Round of 32 fill
    // all four on a wide screen; later rounds have few matches and simply do not fill the row).
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {matches.map((f) => (
        <FixtureGlanceTile key={f.match_id} fixture={f} />
      ))}
    </div>
  );
}

/** A quiet placeholder body for a knockout round with no fixtures yet (pairings unresolved / not
 *  scheduled). Not blank: it states the gate the round is waiting on. */
function PlaceholderBody({ text }: { text: string }) {
  return <p className="text-sm text-muted">{text}</p>;
}

/** The Played recap, SEPARATED by stage and ordered NEWEST-FIRST: the latest-played stage leads
 *  (Final/third-place down to Group stage), and within each stage the tiles are sorted by kickoff
 *  DESCENDING, so the freshest results sit at the top when expanded (no scrolling to reach recent
 *  results). Each stage with a finished match gets a small sub-heading + count above its tile grid; a
 *  stage with no finished match is skipped entirely (no empty sub-heading). */
function PlayedByStage({ matches }: { matches: DailyFixture[] }) {
  return (
    <div className="space-y-4">
      {PLAYED_STAGE_ORDER_NEWEST_FIRST.map((stage) => {
        // filter() returns a fresh array, so this sort never mutates the caller's `matches`.
        const inStage = matches.filter((f) => f.stage === stage).sort((a, b) => byKickoff(b, a));
        if (inStage.length === 0) return null;
        return (
          <div key={stage}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-secondary uppercase">
                {stageLabel(stage)}
              </h3>
              <span className="tnum text-[11px] text-muted">
                {inStage.length} {inStage.length === 1 ? "match" : "matches"}
              </span>
            </div>
            <MatchList matches={inStage} />
          </div>
        );
      })}
    </div>
  );
}

export function MatchSections({
  fixtures,
  nowISO,
}: {
  fixtures: DailyFixture[];
  /** A single server-side reference instant (ISO). All "nearest upcoming" math keys off this so
   *  SSR is deterministic and hydration-stable. */
  nowISO: string;
}) {
  if (fixtures.length === 0) {
    return <p className="text-sm text-secondary">No fixtures available.</p>;
  }

  // Played: every finished fixture, any round, kickoff-ordered. Its summary is the most recent.
  const played = fixtures.filter((f) => f.finished).slice().sort(byKickoff);
  const latestPlayed = played.length ? played[played.length - 1] : null;

  // Group stage: the round's own fixtures (results + upcoming), kickoff-ordered.
  const groupMatches = fixtures.filter((f) => f.stage === "group").slice().sort(byKickoff);
  const groupNearest = nearestUpcoming(groupMatches, nowISO);
  const groupLatest = mostRecentPlayed(groupMatches);

  return (
    <div className="space-y-3">
      {/* ── Played ─────────────────────────────────────────────────────────────── */}
      <Section
        label="Played"
        count={played.length}
        defaultOpen={false}
        summary={
          latestPlayed ? (
            <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="flex shrink-0 items-center gap-2 text-sm text-fg">
                <TeamCodeInline name={latestPlayed.team_a} />
                <span className="tnum shrink-0 font-semibold">
                  {latestPlayed.result ? `${latestPlayed.result.a}-${latestPlayed.result.b}` : ""}
                </span>
                <TeamCodeInline name={latestPlayed.team_b} />
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted whitespace-nowrap">
                <LocalKickoff iso={latestPlayed.kickoff_utc} className="tnum" />
              </span>
            </span>
          ) : (
            <span className="text-sm text-muted">No matches played yet</span>
          )
        }
      >
        {played.length ? (
          <>
            <PlayedByStage matches={played} />
            <p className="mt-3 text-xs text-muted">
              {played.length} played {played.length === 1 ? "match" : "matches"}.
            </p>
          </>
        ) : (
          <PlaceholderBody text="No matches have been played yet." />
        )}
      </Section>

      {/* ── Group stage ────────────────────────────────────────────────────────── */}
      <Section
        label="Group Stage"
        count={groupMatches.length}
        defaultOpen={false}
        summary={
          groupMatches.length ? (
            <PopulatedSummary nearest={groupNearest} latest={groupLatest} />
          ) : (
            <span className="text-sm text-muted">Schedule pending</span>
          )
        }
      >
        {groupMatches.length ? (
          <MatchList matches={groupMatches} />
        ) : (
          <PlaceholderBody text="The group-stage schedule is not available yet." />
        )}
      </Section>

      {/* ── Knockout rounds ──────────────────────────────────────────────────────
          A round "has matches" once its fixtures are scheduled (a kickoff exists). The Final
          section also carries the third-place play-off so the seven-section order holds. */}
      {KO_SECTIONS.map(({ stage, label, placeholder }) => {
        const stages: Stage[] =
          stage === "final" ? ["third_place_playoff", "final"] : [stage];
        const matches = fixtures
          .filter((f) => stages.includes(f.stage) && Boolean(f.kickoff_utc))
          .slice()
          .sort(byKickoff);
        const hasMatches = matches.length > 0;
        const nearest = nearestUpcoming(matches, nowISO);
        const latest = mostRecentPlayed(matches);

        return (
          <Section
            key={stage}
            label={label}
            count={matches.length}
            defaultOpen={false}
            summary={
              hasMatches ? (
                <PopulatedSummary nearest={nearest} latest={latest} />
              ) : (
                <span className="text-sm text-muted">{placeholder}</span>
              )
            }
          >
            {hasMatches ? <MatchList matches={matches} /> : <PlaceholderBody text={placeholder} />}
          </Section>
        );
      })}
    </div>
  );
}

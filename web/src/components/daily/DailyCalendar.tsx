import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { Flag } from "@/components/ui/Flag";
import { LocalKickoff } from "@/components/ui/LocalKickoff";
import { teamCode } from "@/lib/teamCodes";
import { MatchCalendar } from "@/components/daily/MatchCalendar";
import {
  formatDateLabel, type DailyIndex, type DailyFixture, type LiveScore,
} from "@/lib/data/daily";

function dayParts(date: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${date}T00:00:00Z`);
  const fmt = (opt: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...opt, timeZone: "UTC" }).format(d);
  return { weekday: fmt({ weekday: "short" }), day: fmt({ day: "numeric" }), month: fmt({ month: "short" }) };
}

/** A compact UTC date label for the matchday header, e.g. "Tue 23 Jun" (short weekday + day + short
 *  month). Deterministic (UTC). Kept tight so the "Next Matchday - <date>" header holds one line at
 *  390px, where the full formatDateLabel ("Thursday, 11 June") would wrap. */
function formatDateShort(date: string): string {
  const { weekday, day, month } = dayParts(date);
  return `${weekday} ${day} ${month}`;
}

// How long after kickoff a fixture is still treated as "now playing" before it rolls to the next
// (a generous match window: 90 + stoppage + half-time, with headroom for extra time / penalties).
const LIVE_WINDOW_MS = 2.5 * 60 * 60 * 1000; // ~2.5h

/** The three-state matchday card model. Pure: derived from the fixtures + the single server `now`
 *  (LIVE / UP NEXT are clock-based) and the index (COMPLETE is the data's allComplete). Exported so
 *  the state machine is directly unit-testable without rendering. */
export type MatchdayCard =
  | { state: "live"; fixture: DailyFixture; date: string }
  | { state: "next"; fixture: DailyFixture; date: string }
  | { state: "complete"; champion: string | null; result: DailyFixture | null };

/** A fixture is LIVE when its kickoff has passed (<= now) and it is not finished and we are still
 *  inside the live window (now <= kickoff + ~2.5h). */
function isLive(f: DailyFixture, now: number): boolean {
  if (f.finished || !f.kickoff_utc) return false;
  const k = Date.parse(f.kickoff_utc);
  if (Number.isNaN(k)) return false;
  return k <= now && now <= k + LIVE_WINDOW_MS;
}

/** Resolve the matchday card state from the live data + the single server now.
 *   LIVE     -> a fixture inside its live window (earliest such kickoff).
 *   UP NEXT  -> no live fixture but future fixtures remain (the soonest unfinished kickoff at/after now).
 *   COMPLETE -> nothing remains (index.allComplete): the defined tournament-over end state. */
export function matchdayCardState(
  fixtures: DailyFixture[],
  index: DailyIndex,
  nowISO: string,
  champion: string | null,
): MatchdayCard {
  const now = Date.parse(nowISO);
  const withKick = fixtures.filter((f) => f.kickoff_utc);
  const byKick = (a: DailyFixture, b: DailyFixture) =>
    (a.kickoff_utc as string).localeCompare(b.kickoff_utc as string) || a.match_no - b.match_no;

  // LIVE: the earliest fixture currently inside its live window.
  const live = withKick.filter((f) => isLive(f, now)).sort(byKick)[0] ?? null;
  if (live) {
    return { state: "live", fixture: live, date: (live.kickoff_utc as string).slice(0, 10) };
  }

  // UP NEXT: future fixtures remain (not allComplete). The soonest unfinished kickoff at/after now,
  // falling back to the earliest unfinished kickoff if every remaining kickoff is already in the past.
  if (!index.allComplete) {
    const upcoming = withKick.filter((f) => !f.finished).sort(byKick);
    const next = upcoming.find((f) => (f.kickoff_utc as string) >= nowISO) ?? upcoming[0] ?? null;
    if (next) {
      return { state: "next", fixture: next, date: (next.kickoff_utc as string).slice(0, 10) };
    }
  }

  // COMPLETE: the tournament is over. The final result (M104, else the last finished fixture) frames
  // the champion. Never empty: champion may be null but the card still renders the end state.
  const final =
    fixtures.find((f) => f.match_id === "M104" && f.finished) ??
    fixtures.filter((f) => f.finished && f.kickoff_utc).sort(byKick).pop() ??
    null;
  return { state: "complete", champion, result: final };
}

/** A team chip for the card: fixed-dimension Flag + the FIFA trigram. Unresolved side reads "TBC". */
function CardTeam({ name }: { name: string | null }) {
  if (!name) return <span className="text-muted">TBC</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Flag team={name} size="text-base" link={false} />
      <span className="font-semibold text-fg">{teamCode(name)}</span>
    </span>
  );
}

/** The briefing call-to-action, right-aligned and vertically centered to the card height. The whole
 *  card is the actual link target; this is the visible affordance. ASCII arrow "->" only. */
function BriefingLink() {
  // Right-aligned, vertically centered. At 390px the label collapses to the bare ASCII arrow so the
  // single-line fixture line ("Now playing: A vs B ...") keeps the card width; the full label returns
  // at sm+. The markup always carries "Open briefing ->" (only CSS hides the label), so SSR + tests
  // still see the full affordance.
  return (
    <span className="shrink-0 self-center text-sm font-medium text-confident whitespace-nowrap">
      <span className="hidden sm:inline">Open briefing </span>-&gt;
    </span>
  );
}

/** The three-state matchday card body. Same card position/chrome in every state; only the internal
 *  content + whether the briefing link is shown changes. The whole card is the briefing link target
 *  when a briefing date exists (LIVE / UP NEXT, and COMPLETE when a final briefing exists). */
function MatchdayCardBody({
  card,
  liveScore,
  finalBriefing,
}: {
  card: MatchdayCard;
  /** An in-progress score for the LIVE fixture, when one is reliably persisted (else null). */
  liveScore: LiveScore | null;
  /** The briefing date for the COMPLETE state, when a final briefing exists (else null -> no link). */
  finalBriefing: string | null;
}) {
  const cardChrome =
    "group flex min-h-[64px] items-center justify-between gap-3 rounded-card border border-confident/40 bg-confident/5 px-4 py-3 transition hover:bg-confident/10";

  if (card.state === "live" || card.state === "next") {
    const f = card.fixture;
    const live = card.state === "live";
    const inner = (
      <div className={cardChrome}>
        <div className="flex min-w-0 flex-col justify-center gap-1">
          <span className="text-[11px] font-medium tracking-wide text-confident uppercase whitespace-nowrap">
            Next Matchday - {formatDateShort(card.date)}
          </span>
          <span className="flex items-center gap-x-1.5 font-display text-xs font-semibold text-fg whitespace-nowrap">
            <span className="text-secondary">{live ? "Now playing:" : "Up next:"}</span>
            <CardTeam name={f.team_a} />
            <span className="text-[10px] font-normal text-muted">vs</span>
            <CardTeam name={f.team_b} />
            {live ? (
              liveScore ? (
                <span className="tnum font-semibold text-fg">
                  {liveScore.a}-{liveScore.b}
                </span>
              ) : (
                <span className="text-[10px] font-medium text-confident">In progress</span>
              )
            ) : (
              // time only: the date is already on the header line, so the fixture line stays compact + single-line at 390px
              <LocalKickoff iso={f.kickoff_utc} timeOnly className="tnum text-[10px] font-normal text-muted" />
            )}
          </span>
        </div>
        <BriefingLink />
      </div>
    );
    return <Link href={`/matches/day/${card.date}`}>{inner}</Link>;
  }

  // COMPLETE: a defined tournament-over end state. Champion + the final result; the briefing link is
  // shown ONLY when a final briefing exists (otherwise the LINK is dropped, never the card).
  const champ = card.champion;
  const res = card.result;
  const body = (
    <div className={cardChrome}>
      <div className="flex min-w-0 flex-col justify-center gap-1">
        <span className="text-[11px] font-medium tracking-wide text-confident uppercase whitespace-nowrap">
          Tournament complete
        </span>
        <span className="flex items-center gap-x-2 font-display text-sm font-semibold text-fg whitespace-nowrap">
          {champ ? (
            <>
              <span className="text-secondary">Champion:</span>
              <CardTeam name={champ} />
            </>
          ) : (
            <span className="text-secondary">Final result</span>
          )}
          {res && res.result ? (
            <span className="inline-flex items-center gap-2">
              <CardTeam name={res.team_a} />
              <span className="tnum font-semibold text-fg">
                {res.result.a}-{res.result.b}
              </span>
              <CardTeam name={res.team_b} />
            </span>
          ) : null}
        </span>
      </div>
      {finalBriefing ? <BriefingLink /> : null}
    </div>
  );
  return finalBriefing ? <Link href={`/matches/day/${finalBriefing}`}>{body}</Link> : body;
}

/** The matchday section of the consolidated /matches page (formerly the /daily index): the
 *  state-aware next-matchday card (LIVE / UP NEXT / COMPLETE, always visible) above the interactive
 *  two-month calendar (MatchCalendar) spanning the tournament window. Each match day is tinted by
 *  stage with capped team flags; clicking a day reveals its matches inline and links through to the
 *  briefing at /matches/day/[date], computed from the model's published runs. */
export function DailyCalendar({
  index,
  fixtures = [],
  nowISO,
  champion = null,
  liveScore = null,
}: {
  index: DailyIndex;
  /** The full fixture set (kickoff/teams/result) the card derives its LIVE/UP NEXT state from. */
  fixtures?: DailyFixture[];
  /** The single server reference instant (ISO); LIVE / UP NEXT are clock-based against it. */
  nowISO?: string;
  /** The current champion pick (getProjectedBracket().champion, or M104 winner) for COMPLETE. */
  champion?: string | null;
  /** An in-progress score for the LIVE fixture, when reliably persisted (else null -> no fabrication). */
  liveScore?: LiveScore | null;
}) {
  const { dates, nearest, today, start, end } = index;

  // The state-aware matchday card: LIVE / UP NEXT (clock-based on nowISO) or COMPLETE (the data's
  // allComplete). Falls back to the today reference when no server now is supplied.
  const card = matchdayCardState(fixtures, index, nowISO ?? `${today}T00:00:00.000Z`, champion);
  // A final briefing exists (so the COMPLETE link has a day to open) when the final fixture has a
  // kickoff date; otherwise the link is dropped (never the card).
  const finalBriefing =
    card.state === "complete" && card.result?.kickoff_utc
      ? (card.result.kickoff_utc as string).slice(0, 10)
      : null;

  return (
    <section aria-label="Daily briefings calendar" className="mt-6">
      <h2 className="font-display text-base font-semibold text-fg">Daily briefings</h2>
      <p className="mt-1 max-w-prose text-sm text-secondary">
        A matchday-by-matchday companion to the forecast: the day&apos;s fixtures, the biggest model
        movers, and what the engine is watching, every day of World Cup 2026.
      </p>

      {today < start ? (
        <div className="mt-4 rounded-card border border-dashed border-border bg-surface p-4">
          <div className="mb-1 flex items-center gap-2">
            <Tag variant="confident">Starts {formatDateLabel(start)}</Tag>
          </div>
          <p className="max-w-prose text-sm text-muted">
            Daily briefings begin at kickoff ({formatDateLabel(start)}). The schedule below is live
            now; each day&apos;s briefing fills in from the model&apos;s runs as the tournament unfolds.
          </p>
        </div>
      ) : null}

      {/* The state-aware matchday card. LIVE ("Now playing") and UP NEXT are clock-based against the
          single server now; COMPLETE is the data's allComplete (tournament over). It looks
          intentional in every state, including 3am with nothing live and after the Final. */}
      <div className="mt-4">
        <MatchdayCardBody card={card} liveScore={liveScore} finalBriefing={finalBriefing} />
      </div>

      {/* The interactive two-month calendar (replaces the former full-width day-list): month grids
          spanning the tournament, each match day tinted by stage with capped team flags; click a day
          to reveal its matches inline and link through to /matches/day/[date]. */}
      <MatchCalendar
        fixtures={fixtures}
        dates={dates}
        start={start}
        end={end}
        today={today}
        nearest={nearest}
      />

      <p className="mt-4 text-xs text-muted">
        Tournament window: {formatDateLabel(start)} to {formatDateLabel(end)}.
      </p>
    </section>
  );
}

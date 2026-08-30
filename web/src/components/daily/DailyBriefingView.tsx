import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { DailyMatchRow } from "@/components/daily/DailyMatchRow";
import { BriefingSections } from "@/components/daily/BriefingSections";
import {
  formatDateLabel, stageLabel, TOURNAMENT_START, TOURNAMENT_END, type DailyBriefing,
} from "@/lib/data/daily";

/** Adjacent UTC date (±1 day), or null if it falls outside the tournament window. */
function step(date: string, dir: -1 | 1): string | null {
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + dir * 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (next < TOURNAMENT_START || next > TOURNAMENT_END) return null;
  return next;
}

function NavLink({ date, dir }: { date: string | null; dir: -1 | 1 }) {
  if (!date) {
    return <span className="text-xs text-muted/50">{dir === -1 ? "← Prev" : "Next →"}</span>;
  }
  return (
    <Link href={`/matches/day/${date}`} className="text-xs font-medium text-confident hover:underline">
      {dir === -1 ? `← ${formatDateLabel(date)}` : `${formatDateLabel(date)} →`}
    </Link>
  );
}

/** A single date's briefing: the computed briefing sections (recap / movers / watching /
 *  headline) over the date's real scheduled fixtures. Graceful empty state when nothing is
 *  scheduled. */
export function DailyBriefingView({ briefing }: { briefing: DailyBriefing }) {
  const { date, fixtures, inWindow, source, auto, watchingLabel } = briefing;
  const stages = [...new Set(fixtures.map((f) => f.stage))];
  const summary =
    fixtures.length === 0
      ? "No matches scheduled"
      : `${fixtures.length} ${fixtures.length === 1 ? "match" : "matches"} · ${stages.map(stageLabel).join(" · ")}`;
  const finishedCount = fixtures.filter((f) => f.finished).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/matches" className="text-xs font-medium text-confident hover:underline">
        ← All matchdays
      </Link>

      <div className="mt-2 mb-1 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-fg">{formatDateLabel(date)}</h1>
        {fixtures.length > 0 ? (
          finishedCount === fixtures.length ? (
            <Tag variant="gold">Recap</Tag>
          ) : (
            <Tag variant="confident">Preview</Tag>
          )
        ) : null}
      </div>
      <p className="text-sm text-secondary">{summary}</p>

      {inWindow ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <NavLink date={step(date, -1)} dir={-1} />
          <NavLink date={step(date, 1)} dir={1} />
        </div>
      ) : null}

      {/* Computed briefing - recap vs the pre-matchday run, movers, what the model is watching. */}
      <div className="mt-6">
        <BriefingSections auto={auto} hasFixtures={fixtures.length > 0} watchingLabel={watchingLabel} />
      </div>

      {/* Factual skeleton - the real schedule for the day. */}
      <section className="mt-8 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-fg">Scheduled matches</h2>
          {fixtures.length > 0 ? (
            <span className="text-xs text-muted">Times in your local timezone</span>
          ) : null}
        </div>

        {fixtures.length === 0 ? (
          <div className="rounded-card border border-dashed border-border bg-surface p-6 text-center">
            <p className="text-sm font-medium text-secondary">
              {inWindow ? "No matches on this date." : "Outside the tournament window."}
            </p>
            <p className="mx-auto mt-1 max-w-prose text-xs text-muted">
              {inWindow
                ? "A rest day in the schedule. The next matchday is one tap away above."
                : `The tournament runs ${formatDateLabel(TOURNAMENT_START)} → ${formatDateLabel(TOURNAMENT_END)}.`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {fixtures.map((f) => (
              <DailyMatchRow key={f.match_id} fixture={f} />
            ))}
          </div>
        )}

        {source === "static" && fixtures.length > 0 ? (
          <p className="text-xs text-muted">
            Showing the published schedule. Live model odds appear once a prediction run is connected.
          </p>
        ) : null}
      </section>
    </div>
  );
}

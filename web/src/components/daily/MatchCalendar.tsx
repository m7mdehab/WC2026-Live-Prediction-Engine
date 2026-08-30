"use client";

// The interactive matchday calendar (replaces the old full-width day-list). Renders the tournament
// span as month grids (data-driven from the fixture date range). Every match day is tinted by its
// DOMINANT ROUND via the shared STAGE_COLOR token map (cell background, border, a colour bar, and the
// date + match-count text), with a legend under the calendar. Today carries a neutral foreground ring
// (so it stays visible on top of any round tint, including the R32 blue), the nearest upcoming day a
// fainter neutral ring, and played days keep their round colour at a reduced tint plus a check.
// Desktop (md+) shows the months side by side with team flags in each cell. Below md it shows ONE
// month at a time with a segmented switcher + horizontal swipe, and cells omit the (illegible) flags;
// the flags live in the tap-reveal recap (DailyMatchRow), which also links to /matches/day/<date>.
// Pure layout + colour helpers live in @/lib/calendar (unit-tested); this is the interactive shell.
import { useRef, useState, type TouchEvent } from "react";
import Link from "next/link";
import { Flag } from "@/components/ui/Flag";
import { DailyMatchRow } from "@/components/daily/DailyMatchRow";
import { cn } from "@/lib/utils";
import {
  WEEKDAYS, buildCalendarMonths, bucketByDate, summaryByDate, dayTeams, cappedFlags,
  formatDayLabel, STAGE_COLOR, dominantStage, presentStagesInOrder, shortMonthLabel,
} from "@/lib/calendar";
import type { DailyFixture, DailyDateSummary } from "@/lib/data/daily";

/** A small check glyph for a played day (inline SVG, never an emoji). */
function CheckMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-gold">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function MatchCalendar({
  fixtures,
  dates,
  start,
  end,
  today,
  nearest,
}: {
  fixtures: DailyFixture[];
  dates: DailyDateSummary[];
  start: string;
  end: string;
  /** Today's UTC date (request time) - ringed in the neutral foreground token. */
  today: string;
  /** The next-matchday date (the unfinished-match rule) - a fainter neutral ring when not today. */
  nearest: string | null;
}) {
  const months = buildCalendarMonths(start, end);
  const byDate = bucketByDate(fixtures);
  const summary = summaryByDate(dates);
  const legendStages = presentStagesInOrder(dates);

  const [selected, setSelected] = useState<string | null>(null);
  // Mobile single-month view: default to the month holding today (else nearest, else the first).
  const [activeMonth, setActiveMonth] = useState(() => {
    const key = (today || nearest || start).slice(0, 7);
    const i = months.findIndex((m) => m.key === key);
    return i >= 0 ? i : 0;
  });
  const touchX = useRef<number | null>(null);

  const selectedFixtures = selected ? byDate[selected] ?? [] : [];

  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    touchX.current = e.changedTouches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: TouchEvent<HTMLDivElement>) {
    if (touchX.current == null || months.length < 2) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 40) return; // ignore taps / tiny drags
    setActiveMonth((m) => Math.max(0, Math.min(months.length - 1, dx < 0 ? m + 1 : m - 1)));
  }

  return (
    <div data-match-calendar className="mt-4">
      {/* mobile-only segmented month switcher (derived from the fixture month range). Desktop shows
          both months at once, so the switcher is hidden from md up. */}
      {months.length > 1 ? (
        <div
          role="group"
          aria-label="Select month"
          className="mb-3 flex gap-1 rounded-md border border-border bg-bg-subtle p-1 md:hidden"
        >
          {months.map((mo, i) => (
            <button
              key={mo.key}
              type="button"
              aria-pressed={i === activeMonth}
              data-month-switch={mo.key}
              onClick={() => setActiveMonth(i)}
              className={cn(
                "tnum flex-1 rounded px-2 py-1 text-xs font-medium transition",
                i === activeMonth ? "bg-surface text-fg" : "text-muted",
              )}
            >
              {shortMonthLabel(mo.key)}
            </button>
          ))}
        </div>
      ) : null}

      {/* months: one active month below md (swipeable), both side by side from md up */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {months.map((mo, monthIdx) => (
          <div
            key={mo.key}
            data-cal-month={mo.key}
            className={cn(
              "min-w-0 rounded-card border border-border bg-surface p-3 md:block",
              monthIdx === activeMonth ? "block" : "hidden",
            )}
          >
            <h3 className="tnum mb-2 text-sm font-semibold text-fg">{mo.label}</h3>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-[10px] font-medium tracking-wide text-muted uppercase">
                  {w}
                </div>
              ))}
              {mo.weeks.flat().map((cell, i) => {
                if (!cell.date) return <div key={`pad-${i}`} className="min-h-[2.75rem]" />;
                const s = summary[cell.date];
                const matchCount = s?.matchCount ?? 0;
                const completed = matchCount > 0 && (s?.completedCount ?? 0) === matchCount;
                const dayFix = byDate[cell.date] ?? [];
                const stage = dominantStage(dayFix.map((f) => f.stage)) ?? dominantStage(s?.stages ?? []);
                const color = stage ? STAGE_COLOR[stage] : null;
                const isToday = cell.date === today;
                const isNearest = cell.date === nearest;
                const isSel = cell.date === selected;
                const { shown, extra } = cappedFlags(dayTeams(dayFix));

                // Round colour from the shared STAGE_COLOR map (reduced tint once the day is played).
                // Rest days (no matches) stay transparent + dim.
                const tint = color ? (completed ? color.tintPlayed : color.tint) : "border-transparent";

                const cellCls = cn(
                  "flex min-h-[2.75rem] min-w-0 flex-col gap-0.5 rounded-md border p-1 text-left transition",
                  tint,
                  matchCount > 0 ? "cursor-pointer hover:border-border-strong" : "opacity-60",
                  // today + nearest rings are NEUTRAL (foreground), so they read on top of any tint.
                  isToday ? "ring-1 ring-fg" : "",
                  isNearest && !isToday ? "ring-1 ring-fg/40" : "",
                  isSel ? "ring-2 ring-fg" : "",
                );

                if (matchCount === 0) {
                  return (
                    <div key={cell.date} className={cellCls}>
                      <span className="tnum text-[11px] text-muted">{cell.day}</span>
                    </div>
                  );
                }

                const dateCls = cn("tnum text-[11px] font-semibold", color ? color.text : "text-fg");
                const countCls = cn("tnum text-[9px]", color ? color.text : "text-muted");

                return (
                  <button
                    key={cell.date}
                    type="button"
                    aria-pressed={isSel}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={`${formatDayLabel(cell.date)}: ${matchCount} ${matchCount === 1 ? "match" : "matches"}`}
                    data-cal-day={cell.date}
                    data-stage={stage ?? ""}
                    data-cal-played={completed ? "1" : "0"}
                    data-cal-today={isToday ? "1" : "0"}
                    onClick={() => setSelected(isSel ? null : cell.date)}
                    className={cellCls}
                  >
                    {/* round-colour bar (the primary colour cue on mobile, where flags are omitted) */}
                    {color ? <span aria-hidden className={cn("h-1 w-full rounded-full", color.dot)} /> : null}
                    <span className="flex items-center justify-between gap-1">
                      <span className={dateCls}>{cell.day}</span>
                      <span className="flex items-center gap-0.5">
                        {completed ? <CheckMark /> : null}
                        <span className={countCls}>{matchCount}</span>
                      </span>
                    </span>
                    {/* team flags: desktop cells only (illegible at mobile cell size) */}
                    {shown.length ? (
                      <span className="hidden flex-wrap gap-0.5 md:flex">
                        {shown.map((t) => (
                          <Flag key={t} team={t} size="text-[11px]" link={false} />
                        ))}
                        {extra > 0 ? <span className={countCls}>+{extra}</span> : null}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* legend: a chip per round present in the window, in tournament order, dot + name from the
          shared stage map (no prose, tokens only). Renders on every viewport. */}
      {legendStages.length ? (
        <div data-cal-legend className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {legendStages.map((s) => {
            const c = STAGE_COLOR[s];
            return (
              <span key={s} data-legend-stage={s} className="flex items-center gap-1.5">
                <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", c.dot)} />
                <span className="text-[11px] font-medium text-secondary">{c.label}</span>
              </span>
            );
          })}
        </div>
      ) : null}

      {/* selected-day reveal: the day's matches inline (DailyMatchRow, which renders team flags) + a
          link to the full recap page. Below the grids (full width) so it never overflows the layout. */}
      {selected ? (
        <div data-cal-reveal className="mt-4 rounded-card border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-fg">{formatDayLabel(selected)}</h3>
            <Link
              href={`/matches/day/${selected}`}
              className="shrink-0 text-sm font-medium text-confident whitespace-nowrap"
            >
              View full recap -&gt;
            </Link>
          </div>
          {selectedFixtures.length ? (
            <div className="space-y-2">
              {selectedFixtures.map((f) => (
                <DailyMatchRow key={f.match_id} fixture={f} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No fixtures recorded for this day.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

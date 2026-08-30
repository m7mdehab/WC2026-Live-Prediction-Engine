"use client";

import { useState } from "react";
import { Flag } from "@/components/ui/Flag";
import { flagColor } from "@/lib/flagColors";
import { cn, simPct } from "@/lib/utils";
import {
  applyFilter,
  compareRows,
  highLow,
  matchesQuery,
  togglePick,
  type TimeMachineRow,
} from "./timeMachineLogic";

export type { TimeMachineRow };

const MAX_COMPARE = 3;

/** Inline sparkline of one team's champion odds across the cond-steps. X positions follow
 *  matchesPlayed (not step index); the segment past the scrubbed step fades and a vertical tick marks
 *  the selected step. Strokes are non-scaling so the stretched viewBox never fattens a line. */
function Sparkline({
  values,
  steps,
  idx,
  color,
}: {
  values: number[];
  steps: number[];
  idx: number;
  color: string;
}) {
  const W = 100;
  const H = 24;
  const PAD = 2;
  const maxStep = steps[steps.length - 1] || 1;
  const xs = steps.map((s) => PAD + (s / maxStep) * (W - 2 * PAD));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1e-6);
  const ys = values.map((v) => H - PAD - ((v - min) / range) * (H - 2 * PAD));
  const pointsOf = (from: number, to: number) =>
    xs.slice(from, to + 1).map((x, i) => `${x.toFixed(2)},${ys[from + i].toFixed(2)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-6 w-full" aria-hidden>
      <polyline
        points={pointsOf(0, values.length - 1)}
        fill="none" stroke={color} strokeWidth={1.5} opacity={0.25}
        vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"
      />
      <polyline
        points={pointsOf(0, idx)}
        fill="none" stroke={color} strokeWidth={2} opacity={0.9}
        vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"
      />
      <line
        x1={xs[idx]} x2={xs[idx]} y1={1} y2={H - 1}
        stroke="var(--border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Overlaid head-to-head chart: the compare picks share ONE SVG + one y-domain (min..max across all
 *  picks) so the lines can be read against each other; each line is its nation colour and the selected
 *  step is marked. Decorative: the stat tiles below carry the numbers. */
function CompareChart({
  rows,
  steps,
  idx,
}: {
  rows: TimeMachineRow[];
  steps: number[];
  idx: number;
}) {
  const W = 300;
  const H = 64;
  const PAD = 4;
  const maxStep = steps[steps.length - 1] || 1;
  const xs = steps.map((s) => PAD + (s / maxStep) * (W - 2 * PAD));
  const all = rows.flatMap((r) => r.values);
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const range = Math.max(max - min, 1e-6);
  const yOf = (v: number) => H - PAD - ((v - min) / range) * (H - 2 * PAD);
  const pathOf = (values: number[], to: number) =>
    xs.slice(0, to + 1).map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${yOf(values[i]).toFixed(2)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-14 w-full" aria-hidden>
      {rows.map((r) => {
        const color = flagColor(r.team);
        return (
          <g key={r.team}>
            <path d={pathOf(r.values, r.values.length - 1)} fill="none" stroke={color}
                  strokeWidth={1.5} opacity={0.25} vectorEffect="non-scaling-stroke"
                  strokeLinecap="round" strokeLinejoin="round" />
            <path d={pathOf(r.values, idx)} fill="none" stroke={color} strokeWidth={2.25}
                  opacity={0.95} vectorEffect="non-scaling-stroke"
                  strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}
      <line x1={xs[idx]} x2={xs[idx]} y1={1} y2={H - 1}
            stroke="var(--border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Compact HIGH / LOW readout (the spread) for one team over the whole retained window. */
function HighLowReadout({ values }: { values: number[] }) {
  const hl = highLow(values);
  return (
    <div data-tm-readout className="w-[52px] shrink-0 text-right leading-tight">
      <div data-tm-high className="tnum text-[10px] font-semibold text-fg">H {simPct(hl.high, 0)}</div>
      <div data-tm-low className="tnum text-[10px] text-muted">L {simPct(hl.low, 0)}</div>
    </div>
  );
}

/** The Odds Time Machine island: a shared scrubber over the retained cond-steps drives every row's
 *  displayed %, its signed since-kickoff delta, and its HIGH/LOW spread. INTERACTIVE: team FILTERS
 *  choose which teams show; a COMPARE switch highlights 2-3 head-to-head with an overlaid chart + per-
 *  team stat tiles. Fixed height with an internally scrolling body (zero page-level CLS); the server
 *  parent only mounts this when >= 2 steps exist and hands it a relevance-ordered candidate pool. */
export function OddsTimeMachineClient({
  rows,
  steps,
  totalMatches,
  defaultSelected = [],
  initialCompareMode = false,
}: {
  rows: TimeMachineRow[];
  steps: number[];
  totalMatches: number;
  /** Teams shown initially (top contenders + the biggest since-kickoff faller). */
  defaultSelected?: string[];
  /** Seed compare mode on first render (SSR-testable initial state; default off). */
  initialCompareMode?: boolean;
}) {
  const last = steps.length - 1;
  const poolTeams = rows.map((r) => r.team);
  const seedSelected =
    defaultSelected.length > 0 ? defaultSelected : poolTeams.slice(0, 5);
  const [idx, setIdx] = useState(last);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(seedSelected));
  const [compareMode, setCompareMode] = useState(initialCompareMode);
  const [comparePicks, setComparePicks] = useState<string[]>(() => seedSelected.slice(0, 2));
  // Nation search over the full 48-team rail: filters WHICH chips show, never which are selected, so
  // narrowing the search can never silently drop a team from the shown/compared set.
  const [query, setQuery] = useState("");

  if (rows.length === 0 || steps.length < 2) return null;
  const at = Math.min(Math.max(idx, 0), last);

  const shown = compareMode
    ? compareRows(rows, comparePicks, MAX_COMPARE)
    : applyFilter(rows, selected);

  const onChip = (team: string) => {
    if (compareMode) {
      setComparePicks((prev) => togglePick(prev, team, MAX_COMPARE));
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(team)) next.delete(team);
        else next.add(team);
        return next;
      });
    }
  };
  const enterCompare = (on: boolean) => {
    setCompareMode(on);
    if (on && comparePicks.length === 0) {
      const base = shown.length > 0 ? shown : rows;
      setComparePicks(base.slice(0, 2).map((r) => r.team));
    }
  };

  const chipOn = (team: string) =>
    compareMode ? comparePicks.includes(team) : selected.has(team);

  return (
    <section
      aria-label="Odds time machine"
      data-dash-strip="forecast-time-machine"
      className="mb-6 flex h-[420px] flex-col overflow-hidden rounded-card border border-border bg-surface p-3 shadow-[var(--shadow-card)] md:h-[320px]"
    >
      {/* header: title + the scrubbed step */}
      <div className="flex h-4 shrink-0 items-center justify-between gap-2">
        <span className="truncate font-display text-[11px] font-semibold tracking-wide text-secondary uppercase">
          Odds time machine
        </span>
        <span className="tnum shrink-0 text-[11px] text-muted">
          after {steps[at]} of {totalMatches} matches
        </span>
      </div>

      {/* controls: compare switch + the mode hint */}
      <div className="mt-2 flex h-7 shrink-0 items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={compareMode}
          data-tm-compare
          onClick={() => enterCompare(!compareMode)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
            compareMode
              ? "border-gold-line bg-gold-soft text-gold-strong"
              : "border-border text-secondary hover:bg-elevated",
          )}
        >
          <span
            aria-hidden
            className={cn("h-2 w-2 rounded-full", compareMode ? "bg-gold" : "bg-muted")}
          />
          Compare
        </button>
        <span className="truncate text-[11px] text-muted">
          {compareMode
            ? `head-to-head: pick up to ${MAX_COMPARE} (${comparePicks.length}/${MAX_COMPARE})`
            : "filter teams, then scrub the timeline"}
        </span>
      </div>

      {/* nation search: filters the chip rail below (the result surface) across all 48 teams. Fixed
          height so the strip never reflows (zero CLS). */}
      <div className="mt-2 flex h-8 shrink-0 items-center">
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a nation..."
          aria-label="Search teams by nation to add to the timeline"
          data-tm-search
          className="h-8 w-full rounded-full border border-border bg-bg-subtle px-3 text-[11px] text-fg placeholder:text-muted focus:border-border-strong focus:outline-none"
        />
      </div>

      {/* filter / pick chips: one scroll-x row so the control height never changes (zero CLS). The
          search above narrows WHICH chips render here; the full 48-team set is the universe. */}
      <div
        role="group"
        aria-label={compareMode ? "Pick teams to compare" : "Filter which teams show"}
        className="no-scrollbar mt-2 flex h-8 shrink-0 items-center gap-1.5 overflow-x-auto"
      >
        {rows.filter((r) => matchesQuery(r.team, query)).length === 0 ? (
          <span className="text-[11px] text-muted">No nation matches that search.</span>
        ) : null}
        {rows.filter((r) => matchesQuery(r.team, query)).map((r) => {
          const on = chipOn(r.team);
          const capped = compareMode && !on && comparePicks.length >= MAX_COMPARE;
          return (
            <button
              key={r.team}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-disabled={capped}
              data-tm-filter
              data-team={r.team}
              onClick={() => (capped ? undefined : onChip(r.team))}
              className={cn(
                "inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition",
                on
                  ? "border-border bg-elevated text-fg"
                  : capped
                    ? "border-border text-muted opacity-40"
                    : "border-border text-muted opacity-60 hover:opacity-100",
              )}
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: on ? flagColor(r.team) : "var(--muted)" }}
              />
              <Flag team={r.team} size="text-xs" link={false} />
              <span className="max-w-20 truncate">{r.team}</span>
            </button>
          );
        })}
      </div>

      {/* body: compare view OR the filtered rows; scrolls internally so the strip height is fixed */}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {compareMode ? (
          shown.length > 0 ? (
            <div className="flex flex-col gap-2">
              <CompareChart rows={shown} steps={steps} idx={at} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {shown.map((r) => {
                  const hl = highLow(r.values);
                  const value = r.values[at] ?? 0;
                  const delta = value - (r.values[0] ?? 0);
                  const up = delta > 0.0005;
                  const down = delta < -0.0005;
                  return (
                    <div
                      key={r.team}
                      data-tm-row
                      data-team={r.team}
                      className="min-w-0 rounded-md border border-border bg-bg-subtle px-2 py-1.5"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: flagColor(r.team) }} />
                        <Flag team={r.team} size="text-sm" link={false} />
                        <span className="truncate text-xs font-semibold text-fg">{r.team}</span>
                      </div>
                      <div className="tnum mt-0.5 text-base font-semibold text-fg">{simPct(value)}</div>
                      <div className="mt-0.5 flex items-center justify-between gap-1">
                        <span data-tm-readout className="tnum text-[10px] text-muted">
                          <span data-tm-high className="text-fg">H {simPct(hl.high, 0)}</span>
                          {" / "}
                          <span data-tm-low>L {simPct(hl.low, 0)}</span>
                        </span>
                        <span
                          className={cn(
                            "tnum rounded-full px-1 py-0.5 text-[10px] font-semibold",
                            up ? "bg-up-bg text-up" : down ? "bg-down-bg text-down" : "bg-elevated text-muted",
                          )}
                        >
                          {up ? "+" : ""}{(delta * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted">
              Pick up to {MAX_COMPARE} teams above to compare head-to-head.
            </div>
          )
        ) : shown.length > 0 ? (
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2">
            {shown.map((r, i) => {
              const value = r.values[at] ?? 0;
              const delta = value - (r.values[0] ?? 0);
              const up = delta > 0.0005;
              const down = delta < -0.0005;
              const color = i === 0 ? "var(--gold)" : flagColor(r.team);
              return (
                <div
                  key={r.team}
                  data-tm-row
                  data-team={r.team}
                  className="flex h-9 min-w-0 items-center gap-2"
                >
                  <Flag team={r.team} size="text-sm" link={false} />
                  <span className="w-16 shrink-0 truncate text-xs font-semibold text-fg">
                    {r.team}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Sparkline values={r.values} steps={steps} idx={at} color={color} />
                  </div>
                  <span className="tnum w-11 shrink-0 text-right text-sm font-semibold text-fg">
                    {simPct(value)}
                  </span>
                  <HighLowReadout values={r.values} />
                  <span
                    className={cn(
                      "tnum w-12 shrink-0 rounded-full px-1 py-0.5 text-center text-[10px] font-semibold",
                      up ? "bg-up-bg text-up" : down ? "bg-down-bg text-down" : "bg-elevated text-muted",
                    )}
                  >
                    {up ? "+" : ""}{(delta * 100).toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted">
            No teams selected. Tap a team above to show its trajectory.
          </div>
        )}
      </div>

      {/* one shared scrubber: snaps to the retained cond-steps; 44px touch target; token accent */}
      <input
        type="range"
        min={0}
        max={last}
        step={1}
        value={at}
        onChange={(e) => setIdx(Number(e.target.value))}
        aria-label="Scrub the forecast through the retained steps (matches played)"
        aria-valuetext={`after ${steps[at]} of ${totalMatches} matches`}
        className="mt-2 h-11 w-full shrink-0 cursor-pointer accent-gold"
      />
    </section>
  );
}

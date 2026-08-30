"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { flagColor, flagRing, isLightFlag } from "@/lib/flagColors";
import { rawPct, simPct } from "@/lib/utils";
import { selectOverTimeContenders } from "@/lib/data/titleOddsSelect";
import type { TitleOddsSeries } from "@/lib/data/titleOddsHistory";

type Contender = { team: string; champion: number };

/** Title-odds over time: the REAL champion-probability trajectory of the most RELEVANT teams, from
 *  the tournament kickoff to now, assembled from the retained forecast history (one published run per
 *  step). The x-axis is matches played (kickoff -> now -> Final).
 *
 *  SELECTION: once a trajectory exists the plotted set is chosen by relevance (selectOverTimeContenders),
 *  the still-alive teams PLUS the biggest fallers, so a former contender collapsing toward 0% is always
 *  drawn and the view is never filled with alphabetically-first teams that were flat at 0 all along.
 *
 *  SPACE: the played region (kickoff -> now) is only a small fraction of the calendar (today
 *  ~17/104), so a linear x-axis would squeeze the real trajectory into a thin left slice with a big
 *  empty future. Instead the PLAYED domain is stretched to dominate the plot width and the unplayed
 *  future is compressed into a thin "-> Final (not yet)" runway on the right. No flat line is drawn
 *  into the future. Before any matches are played (a single retained point) the chart shows the
 *  honest pre-tournament baseline cluster instead.
 *
 *  COLOUR: each line is drawn in its nation's recognizable flag colour (flagColor), and the legend
 *  dot + left-column accent match the line. Light/white-dominant flag chips get a subtle ring.
 *
 *  LABELS: each team's left label is aligned to its line's start-y (with small offsets so kickoff
 *  clusters do not collide) and a short connector runs from the label to the line start, so a viewer
 *  can trace each label to the line it belongs to. The current point carries a small flag chip.
 *
 *  `variant="mobile"` uses a narrower viewBox + slightly larger label fonts so flag + name + % stay
 *  legible at ~360px. Standalone client component so the shells render it once, conditionally. */
export function ProbabilityOverTimeChart({
  contenders,
  series = [],
  nowMatchesPlayed,
  totalMatches = 104,
  variant = "desktop",
}: {
  contenders: Contender[];
  /** Per-team champion trajectory from getTitleOddsHistory (all teams; the chart selects by relevance). */
  series?: TitleOddsSeries[];
  /** The "now" position in matches played (current_run.conditioned_on_results). */
  nowMatchesPlayed?: number;
  /** Total tournament matches (kickoff..final); the x-axis spans 0..totalMatches. */
  totalMatches?: number;
  variant?: "desktop" | "mobile";
}) {
  const seriesByTeam = new Map(series.map((s) => [s.team, s]));
  // A real trajectory needs at least two distinct steps; otherwise we are pre-tournament and show
  // the honest baseline cluster.
  const hasHistory = series.some((s) => s.points.length > 1);
  // DEFAULT SELECTION BY RELEVANCE, never alphabetical: once a trajectory exists we plot the still-
  // alive teams PLUS the biggest fallers (former contenders collapsing toward 0%), derived from the
  // full per-team history so the falling-to-zero lines the view exists to show are never dropped.
  // Pre-tournament (no history) keeps the current-standings order handed in.
  const top = hasHistory
    ? selectOverTimeContenders(series, contenders, { limit: 6 })
    : contenders.slice(0, 6);
  // Lines are drawn in the nation's recognizable flag colour; the legend dot and the left % accent
  // follow the same colour so eye-tracing colour-to-team is unambiguous.
  const colorOf = (team: string) => flagColor(team);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (team: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });

  const visible = top.filter((c) => !hidden.has(c.team));

  // plot geometry. Mobile uses a narrower viewBox so the SVG scales up at phone width, keeping the
  // in-SVG label text readable; desktop keeps the locked values.
  const mobile = variant === "mobile";
  const W = mobile ? 340 : 600;
  const VH = mobile ? 222 : 214;
  const X1 = W - 20; // 320 / 580
  // Mobile label is flag + % only (name lives in the legend below), so it can be narrow.
  const labelW = mobile ? 68 : 188;
  const lineStart = labelW + 8; // 76 / 196
  const stubEnd = lineStart + 20; // 96 / 216
  const Y0 = mobile ? 22 : 24;
  const Y1 = mobile ? 188 : 184;
  const fontName = mobile ? 13 : 12;
  const fontPct = mobile ? 14 : 13;
  const fontAxis = mobile ? 11 : 10;
  const flagSize = mobile ? "text-[16px]" : "text-[15px]";
  // Endpoint chip slightly smaller than the left flag so it reads as a marker, not a label.
  const endpointFlag = mobile ? "text-[16px]" : "text-[14px]";
  const svgHeight = mobile ? "h-56" : "h-52";

  // ---- trajectory geometry (history branch) -------------------------------------------------
  // SPACE REALLOCATION: the played domain [0, nowFrac] is stretched to occupy PLAYED_FRAC of the
  // plot width, and the unplayed remainder [nowFrac, 1] is compressed into the thin runway after it.
  // This makes the real, played trajectory large and legible instead of a small left slice.
  const nowFrac =
    nowMatchesPlayed != null && totalMatches > 0
      ? Math.max(0, Math.min(1, nowMatchesPlayed / totalMatches))
      : null;
  // Is there still an UN-FORECAST future? Only while matches remain. Once every match is played
  // (nowFrac === 1, the settled tournament) there is no runway - the "now" marker, the "not yet"
  // future band, and the "future is not yet forecast" caption clause are all dropped (they would be
  // false on a completed tournament). A partial tournament keeps them (the future genuinely isn't forecast).
  const hasFuture = nowFrac != null && nowFrac < 1;
  const plotSpan = X1 - lineStart;
  // Played trajectory takes the bulk of the width; the future runway gets the small remainder.
  const PLAYED_FRAC = 0.82;
  // Boundary x (in svg units) between the played plot and the future runway.
  const nowX = lineStart + plotSpan * PLAYED_FRAC;
  // Map a normalized x in [0,1]: [0..nowFrac] -> [lineStart..nowX] (stretched, the played region),
  // [nowFrac..1] -> [nowX..X1] (compressed, the future runway). Falls back to a plain linear map
  // when there is no "now" position (keeps the pre-history branch + degenerate cases sane).
  const plotX = (x: number) => {
    const xc = Math.max(0, Math.min(1, x));
    if (nowFrac == null || nowFrac <= 0) return lineStart + xc * plotSpan;
    if (xc <= nowFrac) return lineStart + (xc / nowFrac) * (nowX - lineStart);
    return nowX + ((xc - nowFrac) / (1 - nowFrac)) * (X1 - nowX);
  };
  // y scales champion probability across a ZOOMED, data-fitted domain [paddedMin..paddedMax] so the
  // small spread between champion probabilities (~5-11%) reads clearly instead of bunching against a
  // zero baseline. The domain is honest: real percent ticks are drawn on the axis (top/mid/bottom)
  // so a viewer always reads true numbers and is never misled by the non-zero baseline.
  //
  // The plotted set covers every visible value the eye can see: in the history branch that is each
  // visible team's full trajectory; in the pre-history baseline branch it is the visible teams'
  // current odds (so the same zoom applies consistently to both branches). Deterministic: pure
  // function of the data, no randomness or time.
  const plottedPts = hasHistory
    ? visible.flatMap((c) => seriesByTeam.get(c.team)?.points.map((p) => p.champion) ?? [])
    : visible.map((c) => c.champion);
  const dataMin = plottedPts.length ? Math.min(...plottedPts) : 0;
  const dataMax = plottedPts.length ? Math.max(...plottedPts) : 0.02;
  // Pad ~10% of the data range above and below (with a small floor so a flat range still has a band),
  // then clamp into [0,1] so the axis never claims an impossible probability.
  const rawRange = Math.max(dataMax - dataMin, 0.005);
  const padAmt = rawRange * 0.1;
  const paddedMin = Math.max(0, dataMin - padAmt);
  const paddedMax = Math.min(1, dataMax + padAmt);
  // Guard against a degenerate (zero-width) domain so yOf never divides by zero.
  const yDomain = Math.max(paddedMax - paddedMin, 1e-4);
  const yOf = (p: number) => Y1 - ((Math.max(0, p) - paddedMin) / yDomain) * (Y1 - Y0);
  // Axis tick values (real percents): bottom = paddedMin, top = paddedMax, plus a mid tick. These are
  // rendered as text on the y-axis below so the zoom stays honest. `kind` nudges the top label down /
  // bottom label up off the plot edge and keeps the mid label clear, so each value stays legible.
  const yTicks = [
    { v: paddedMax, y: Y0, kind: "top" as const },
    { v: (paddedMin + paddedMax) / 2, y: (Y0 + Y1) / 2, kind: "mid" as const },
    { v: paddedMin, y: Y1, kind: "bottom" as const },
  ];
  // Shared y-axis renderer (gridline + real-percent label) reused by both branches so the zoomed axis
  // is labelled identically whether or not a trajectory is present. Labels sit just inside the plot at
  // the axis line (start-anchored, right of lineStart) so they never collide with the left team-label
  // column; the top/bottom labels are nudged in off the edge so the full percent stays readable.
  const renderYAxis = () =>
    yTicks.map((t) => {
      const ty = t.kind === "top" ? t.y + 9 : t.kind === "bottom" ? t.y - 3 : t.y - 2;
      return (
        <g key={`ytick-${t.kind}`}>
          <line x1={lineStart} x2={X1} y1={t.y} y2={t.y}
                stroke="var(--border-strong)" strokeWidth={1}
                strokeDasharray={t.kind === "mid" ? "1 5" : "2 4"}
                opacity={t.kind === "mid" ? 0.16 : 0.3} />
          <text x={lineStart + 3} y={ty} textAnchor="start" fontSize={fontAxis}
                fontWeight={600} fill="var(--muted)" className="tnum">
            {/* raw-pct-ok: fixed axis gradation label, not an outcome probability */}
            {rawPct(t.v, 1)}
          </text>
        </g>
      );
    });
  const pathFor = (s: TitleOddsSeries) =>
    s.points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${plotX(p.x).toFixed(2)} ${yOf(p.champion).toFixed(2)}`)
      .join(" ");

  // LABEL-ALIGNED STARTS: a label ideally sits at its line's start-y, but kickoff values cluster, so
  // labels would overlap. Anchor each visible team's label at its start-y, then push apart greedily
  // (top to bottom) to a minimum spacing while staying inside the plot band. Deterministic: pure
  // function of the start-y values, no randomness or time. Returns a y per visible team index.
  const labelH = 22;
  const minSpacing = labelH; // no overlap between adjacent label rows
  const startYFor = (c: Contender) => {
    const s = seriesByTeam.get(c.team);
    // History branch: anchor to the trajectory start-y. Baseline branch (no series): anchor to the
    // team's current value on the SAME zoomed axis, so labels and lanes track the real percent.
    if (!s || s.points.length === 0) return yOf(c.champion);
    return yOf(s.points[0].champion);
  };
  const resolveLabelYs = (): number[] => {
    // Both branches anchor labels to the real (zoomed) value, then push apart to avoid overlap.
    const desired = visible.map((c) => startYFor(c));
    const ys = desired.slice();
    // push down to keep min spacing, top-anchored
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] < ys[i - 1] + minSpacing) ys[i] = ys[i - 1] + minSpacing;
    }
    // if the column overflows the band, shift the whole stack up so it fits
    const top0 = Y0 + labelH / 2;
    const bottom = Y1 - labelH / 2;
    const overflow = ys[ys.length - 1] - bottom;
    if (overflow > 0) for (let i = 0; i < ys.length; i++) ys[i] -= overflow;
    if (ys[0] < top0) {
      const lift = top0 - ys[0];
      for (let i = 0; i < ys.length; i++) ys[i] += lift;
    }
    return ys;
  };
  const labelYs = resolveLabelYs();

  // Shared left-label renderer (flag + optional name + bold %), reused by both branches.
  const renderLabel = (c: Contender, y: number, accent: string, isLeader: boolean) => (
    <foreignObject key={`lbl-${c.team}`} x={0} y={y - 11} width={labelW} height={22}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", paddingRight: mobile ? 4 : 8 }}>
        <span style={{ flexShrink: 0, lineHeight: 0 }}>
          <Flag team={c.team} size={flagSize} link={false} />
        </span>
        {!mobile ? (
          <span className="truncate text-fg"
                style={{ fontSize: fontName, fontWeight: 600, minWidth: 0, flex: "1 1 auto" }}>
            {c.team}
          </span>
        ) : null}
        <span className="tnum"
              style={{ flexShrink: 0, marginLeft: "auto", fontSize: fontPct, fontWeight: 700,
                       color: isLeader ? "var(--gold-strong)" : accent }}>
          {simPct(c.champion)}
        </span>
      </div>
    </foreignObject>
  );

  // Small flag endpoint chip at the current point, reusing the foreignObject + <Flag> pattern. Light
  // flags get a subtle ring (flagRing) so the chip reads on the chart.
  const renderEndpoint = (team: string, cx: number, cy: number) => {
    const ring = flagRing(team);
    const light = isLightFlag(team);
    const sz = 18;
    return (
      <foreignObject key={`end-${team}`} x={cx - sz / 2} y={cy - sz / 2} width={sz} height={sz}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
          <span style={{
            lineHeight: 0,
            borderRadius: 3,
            boxShadow: light && ring
              ? `0 0 0 1.5px ${ring}, 0 0 0 2.5px var(--surface)`
              : "0 0 0 1.5px var(--surface)",
          }}>
            <Flag team={team} size={endpointFlag} link={false} />
          </span>
        </div>
      </foreignObject>
    );
  };

  return (
    <Card>
      <CardHeader title="Title-odds over time" hint="champion probability" />
      <svg
        viewBox={`0 0 ${W} ${VH}`}
        className={`${svgHeight} w-full`}
        role="img"
        aria-label={
          (hasHistory
            ? "Champion probability over time: each leading team's title odds from kickoff to now, as matches are played."
            : "Champion probability over time: the top contenders at their current odds, ready to track across the tournament.") +
          // raw-pct-ok: axis range bound labels, not an outcome probability
          ` The vertical axis is zoomed to the data range, from ${rawPct(paddedMin, 1)} to ${rawPct(paddedMax, 1)} champion probability, with real percent labels on the axis.`
        }
      >
        {hasHistory ? (
          <>
            {/* axis at the kickoff start */}
            <line x1={lineStart} x2={lineStart} y1={Y0 - 4} y2={Y1 + 4}
                  stroke="var(--border-strong)" strokeWidth={1} />

            {/* zoomed y-axis: real-percent gridlines + labels (top=paddedMax, mid, bottom=paddedMin)
                so the data-fitted vertical zoom stays honest. Drawn first, behind the trajectories. */}
            {renderYAxis()}

            {/* future runway: the compressed unplayed region (now -> Final). A faint band makes it
                read as "not yet forecast" without taking the space the played trajectory needs. */}
            {hasFuture ? (
              <rect x={nowX} y={Y0 - 4} width={X1 - nowX} height={Y1 - Y0 + 8}
                    fill="var(--border-strong)" opacity={0.06} />
            ) : null}

            {/* "now" guide: a subtle vertical marker where the played trajectory ends and the future
                runway begins, labelled at the top so it never collides with the Kickoff/Final
                labels on the baseline. */}
            {hasFuture ? (
              <>
                <line x1={nowX} x2={nowX} y1={Y0 - 4} y2={Y1 + 4}
                      stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
                <text x={nowX} y={Y0 - 6} textAnchor="middle" fontSize={fontAxis}
                      fill="var(--secondary)" fontWeight={700}>
                  now
                </text>
              </>
            ) : null}

            {/* label-to-line connectors: a short faint line from each repositioned label to where its
                trajectory begins, so the eye can trace label -> line even after offsetting. */}
            {visible.map((c, idx) => {
              const s = seriesByTeam.get(c.team);
              if (!s || s.points.length < 2) return null;
              const ly = labelYs[idx];
              const sy = yOf(s.points[0].champion);
              const sx = plotX(s.points[0].x);
              return (
                <polyline key={`conn-${c.team}`}
                          points={`${labelW + 2},${ly} ${lineStart - 4},${ly} ${sx},${sy}`}
                          fill="none" stroke={colorOf(c.team)} strokeWidth={1} opacity={0.35} />
              );
            })}

            {/* one polyline per visible team: kickoff -> now in the nation's flag colour, then a small
                flag chip at the current point. Nothing is drawn from "now" to "Final". */}
            {visible.map((c) => {
              const s = seriesByTeam.get(c.team);
              if (!s || s.points.length < 2) return null;
              const color = colorOf(c.team);
              const last = s.points[s.points.length - 1];
              return (
                <g key={c.team}>
                  <path d={pathFor(s)} fill="none" stroke={color} strokeWidth={2.4}
                        strokeLinecap="round" strokeLinejoin="round" />
                  {renderEndpoint(c.team, plotX(last.x), yOf(last.champion))}
                </g>
              );
            })}

            {/* left key column: flag + name + bold current %, aligned to each line's start-y (offset
                to avoid collisions), accent colour-matched to its trajectory. The % is the live
                "now" value (never printed on the line). */}
            {visible.map((c, idx) =>
              renderLabel(c, labelYs[idx], colorOf(c.team), top.findIndex((t) => t.team === c.team) === 0)
            )}

            {/* x-axis baseline: Kickoff (start) -> Final (end). The "now" marker is labelled at the
                top of its guide line above, so these two never collide even when "now" sits early. */}
            <text x={lineStart} y={Y1 + 22} textAnchor="start" fontSize={fontAxis} fill="var(--muted)">
              Kickoff
            </text>
            {hasFuture ? (
              <text x={(nowX + X1) / 2} y={Y1 + 22} textAnchor="middle" fontSize={fontAxis} fill="var(--muted)">
                not yet
              </text>
            ) : null}
            <text x={X1} y={Y1 + 22} textAnchor="end" fontSize={fontAxis} fill="var(--muted)">
              Final
            </text>
          </>
        ) : (
          <>
            {/* axis at the line start */}
            <line x1={lineStart} x2={lineStart} y1={Y0 - 4} y2={Y1 + 4}
                  stroke="var(--border-strong)" strokeWidth={1} />

            {/* zoomed y-axis: same real-percent gridlines + labels as the history branch, so the
                data-fitted vertical zoom is applied + labelled consistently in the baseline state. */}
            {renderYAxis()}

            {/* label-to-lane connectors: the lane sits at the team's REAL value on the zoomed axis,
                while its label may be offset to avoid overlap; the connector traces label -> lane. */}
            {visible.map((c, idx) => {
              const ly = labelYs[idx];
              const ly2 = yOf(c.champion);
              return (
                <polyline key={`conn-${c.team}`}
                          points={`${labelW + 2},${ly} ${lineStart - 4},${ly} ${lineStart},${ly2}`}
                          fill="none" stroke={colorOf(c.team)} strokeWidth={1} opacity={0.35} />
              );
            })}

            {visible.map((c, idx) => {
              const isLeader = top.findIndex((t) => t.team === c.team) === 0;
              // Lane sits at the team's REAL champion value on the zoomed axis; the label uses the
              // collision-avoided y so closely clustered values stay readable.
              const y = yOf(c.champion);
              const color = colorOf(c.team);
              return (
                <g key={c.team}>
                  {/* left label: flag + name + bold %, accent colour-matched to the lane */}
                  {renderLabel(c, labelYs[idx], color, isLeader)}

                  {/* clean lane line: solid stub -> dashed projection, in the team's flag colour */}
                  <line x1={lineStart} x2={stubEnd} y1={y} y2={y} stroke={color}
                        strokeWidth={2.4} strokeLinecap="round" />
                  <line x1={stubEnd} x2={X1} y1={y} y2={y} stroke={color} strokeWidth={1.5}
                        strokeDasharray="2 6" strokeLinecap="round" opacity={0.5} />
                  {/* current-point flag chip (mirrors the history branch endpoint) */}
                  {renderEndpoint(c.team, lineStart, y)}
                </g>
              );
            })}

            {/* x-axis timeline ends */}
            <text x={lineStart} y={Y1 + 22} textAnchor="start" fontSize={fontAxis} fill="var(--muted)">
              Kickoff
            </text>
            <text x={X1} y={Y1 + 22} textAnchor="end" fontSize={fontAxis} fill="var(--muted)">
              Final
            </text>
          </>
        )}
      </svg>

      {/* honest caption - adapts to whether a real trajectory is being shown */}
      <p className="mt-1 text-xs text-secondary">
        {hasHistory
          ? `Each point is a model forecast published during the tournament, conditioned on every result completed at that time; the line connects successive published forecasts (recalcs ran in batches, so some matches share a segment).${hasFuture ? " The future, to the Final, is not yet forecast." : ""}`
          : "Each team starts at its current odds; the lines track from here as matches are played."}
      </p>

      {/* legend / toggle, also the colour key; adds/drops teams */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {top.map((c) => {
          const off = hidden.has(c.team);
          return (
            <button
              key={c.team}
              type="button"
              onClick={() => toggle(c.team)}
              aria-pressed={!off}
              className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px] font-medium transition ${
                off ? "text-muted opacity-50" : "text-fg hover:bg-elevated"
              }`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: off ? "var(--muted)" : colorOf(c.team) }} />
              <Flag team={c.team} size="text-xs" link={false} />
              <span className="max-w-24 truncate">{c.team}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

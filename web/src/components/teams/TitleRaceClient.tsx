"use client";

import { useState } from "react";
import Link from "next/link";
import { Flag } from "@/components/ui/Flag";
import { MoverTile } from "./MoverTile";
import { flagColor } from "@/lib/flagColors";
import { teamCode } from "@/lib/teamCodes";
import { cn, simPct } from "@/lib/utils";

// Ported (re-created) from feature/page-dashboards components/dashboard/teams/TitleRaceClient.tsx
// for the Wave-6 team page. Its two <Flag> sites (the SVG edge label and the legend button) sit
// inside interactive/anchor content, so both pass link={false}; the legend's own arrow Link is the
// deep link to the team profile.

/** One serialized top-6 trajectory: values align index-for-index with the shared `steps`
 *  (matchesPlayed per retained cond-step); `current` is the live champion % for the edge label. */
export interface RaceRow {
  team: string;
  id: string; // /teams/[id] slug
  values: number[];
  current: number;
}

/** One overnight mover (already thresholded at |delta| >= 0.3pp by the server parent). */
export interface RaceMover {
  team: string;
  value: number;
  delta: number;
}

// plot geometry (viewBox units)
const W = 420;
const H = 132;
const X0 = 6;
const LABEL_W = 74;
const X1 = W - LABEL_W - 6;
const Y0 = 8;
const Y1 = H - 16;

/** Title-race island: multi-line champion-odds chart (kickoff -> now) for the top 6, direct
 *  right-edge Flag+% labels, "AFTER LAST NIGHT" MoverTile chips, and legend chips that highlight
 *  a line on tap and link to the team profile. Fixed-height block; single step -> dots only.
 *
 *  `focusTeam` (the team page's own nation) is pre-highlighted when it lands in the top 6. */
export function TitleRaceClient({
  rows,
  steps,
  risers,
  fallers,
  focusTeam,
}: {
  rows: RaceRow[];
  steps: number[];
  risers: RaceMover[];
  fallers: RaceMover[];
  focusTeam?: string;
}) {
  const [highlighted, setHighlighted] = useState<string | null>(
    focusTeam && rows.some((r) => r.team === focusTeam) ? focusTeam : null,
  );
  if (rows.length === 0 || steps.length === 0) return null;

  const singleStep = steps.length < 2;
  const movers = [...risers, ...fallers];
  const maxStep = steps[steps.length - 1] || 1;
  const xOf = (mp: number) => X0 + (mp / maxStep) * (X1 - X0);

  // Zoomed, honest y-domain over every plotted value (all six trajectories).
  const all = rows.flatMap((r) => r.values);
  const dataMin = Math.min(...all);
  const dataMax = Math.max(...all);
  const pad = Math.max(dataMax - dataMin, 0.005) * 0.1;
  const lo = Math.max(0, dataMin - pad);
  const hi = Math.min(1, dataMax + pad);
  const domain = Math.max(hi - lo, 1e-4);
  const yOf = (p: number) => Y1 - ((Math.max(0, p) - lo) / domain) * (Y1 - Y0);

  const colorOf = (team: string, i: number) => (i === 0 ? "var(--gold)" : flagColor(team));
  const dim = (team: string) => highlighted != null && highlighted !== team;

  // Right-edge label lanes: anchor each label at its line's end-y, then push apart greedily so
  // clustered endpoints stay readable. Deterministic (pure function of the end-y values).
  const labelH = 15;
  const endYs = rows.map((r) => yOf(r.values[r.values.length - 1] ?? 0));
  const order = endYs.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0]);
  const laneYs = new Array<number>(rows.length);
  let prev = -Infinity;
  for (const [y, i] of order) {
    const lane = Math.max(y, prev + labelH);
    laneYs[i] = lane;
    prev = lane;
  }
  const overflow = Math.max(...laneYs) - (Y1 - labelH / 2);
  if (overflow > 0) for (let i = 0; i < laneYs.length; i++) laneYs[i] -= overflow;

  const pathFor = (r: RaceRow) =>
    r.values
      .map((v, i) => `${i === 0 ? "M" : "L"} ${xOf(steps[i]).toFixed(2)} ${yOf(v).toFixed(2)}`)
      .join(" ");

  return (
    <section
      aria-label="Title race"
      data-dash-strip="teams-title-race"
      className="mb-5 flex h-[276px] flex-col overflow-hidden rounded-card border border-border bg-surface p-3 shadow-[var(--shadow-card)] md:h-[224px]"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 md:flex-row md:gap-3">
        {/* ---- chart: top-6 champion odds, kickoff -> now (dots only on a single step) ---- */}
        <div className="min-h-0 min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-full w-full"
            role="img"
            aria-label="Champion probability from kickoff to now for the top six teams"
          >
            <line x1={X0} x2={X1} y1={Y1} y2={Y1} stroke="var(--border-strong)" strokeWidth={1} opacity={0.5} />
            {rows.map((r, i) => {
              const color = colorOf(r.team, i);
              const lastY = yOf(r.values[r.values.length - 1] ?? 0);
              return (
                <g key={r.team} opacity={dim(r.team) ? 0.2 : 1}>
                  {singleStep ? (
                    r.values.map((v, j) => (
                      <circle key={j} cx={xOf(steps[j])} cy={yOf(v)} r={3} fill={color} />
                    ))
                  ) : (
                    <path
                      d={pathFor(r)}
                      fill="none"
                      stroke={color}
                      strokeWidth={highlighted === r.team ? 3 : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  <circle cx={xOf(maxStep)} cy={lastY} r={2.5} fill={color} />
                  {/* connector into the label lane, then the direct Flag+% edge label */}
                  <line
                    x1={xOf(maxStep)} x2={X1 + 4} y1={lastY} y2={laneYs[i]}
                    stroke={color} strokeWidth={1} opacity={0.4}
                  />
                  <foreignObject x={X1 + 5} y={laneYs[i] - 7} width={LABEL_W} height={14}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ flexShrink: 0, lineHeight: 0 }}>
                        <Flag team={r.team} size="text-[11px]" link={false} />
                      </span>
                      <span
                        className="tnum"
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: i === 0 ? "var(--gold-strong)" : color,
                        }}
                      >
                        {simPct(r.current)}
                      </span>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
            <text x={X0} y={H - 3} textAnchor="start" fontSize={9} fill="var(--muted)">
              Kickoff
            </text>
            <text x={X1} y={H - 3} textAnchor="end" fontSize={9} fill="var(--muted)" className="tnum">
              now ({maxStep})
            </text>
          </svg>
        </div>

        {/* ---- overnight movers (hidden entirely when no |delta| clears the threshold) ---- */}
        {movers.length > 0 ? (
          <div className="flex shrink-0 flex-col md:w-[300px]">
            <span className="font-display text-[10px] font-semibold tracking-wide text-secondary uppercase">
              After last night
            </span>
            <div className="mt-1 flex h-[64px] gap-1.5 overflow-x-auto md:grid md:h-auto md:flex-1 md:grid-cols-3 md:overflow-visible">
              {movers.map((m) => (
                <div key={m.team} className="h-full w-40 shrink-0 md:w-auto md:min-w-0">
                  <MoverTile team={m.team} value={m.value} delta={m.delta} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ---- legend chips: tap highlights a line; the arrow links to the team profile ---- */}
      <div className="mt-2 flex h-7 shrink-0 items-center gap-1.5 overflow-x-auto">
        {rows.map((r, i) => {
          const active = highlighted === r.team;
          return (
            <span
              key={r.team}
              className="inline-flex h-6 shrink-0 items-stretch overflow-hidden rounded-full border border-border"
            >
              <button
                type="button"
                onClick={() => setHighlighted(active ? null : r.team)}
                aria-pressed={active}
                aria-label={`Highlight ${r.team}`}
                className={cn(
                  "flex items-center gap-1 px-2 text-[11px] font-medium transition",
                  active ? "bg-elevated text-fg" : "text-secondary hover:bg-elevated",
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: colorOf(r.team, i) }}
                />
                <Flag team={r.team} size="text-xs" link={false} />
                {teamCode(r.team)}
              </button>
              <Link
                href={`/teams/${r.id}`}
                aria-label={`${r.team} profile`}
                className="flex items-center border-l border-border px-1.5 text-[11px] text-muted transition hover:bg-elevated hover:text-fg"
              >
                {"->"}
              </Link>
            </span>
          );
        })}
      </div>
    </section>
  );
}

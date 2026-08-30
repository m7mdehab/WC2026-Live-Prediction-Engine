"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { OutcomeClass, ReliabilityPoint } from "@/lib/types/methodology";

// Brand accents per outcome class (identical in both themes, per design_tokens.json).
const FILL: Record<OutcomeClass, string> = {
  home_win: "fill-confident",
  draw: "fill-upset",
  away_win: "fill-up",
};
const DOT: Record<OutcomeClass, string> = {
  home_win: "bg-confident",
  draw: "bg-upset",
  away_win: "bg-up",
};
const CLASS_LABEL: Record<OutcomeClass, string> = {
  home_win: "Home win",
  draw: "Draw",
  away_win: "Away win",
};

const YEARS = [2018, 2022] as const;

// SVG geometry - a square plot with room for axis ticks/labels.
const SIZE = 300;
const PAD = { l: 34, r: 12, t: 12, b: 30 };
const INNER = SIZE - PAD.l - PAD.r; // square: same height inset is applied below
const PLOT = SIZE - PAD.t - PAD.b;

const xOf = (p: number) => PAD.l + p * INNER;
const yOf = (f: number) => PAD.t + (1 - f) * PLOT;
// Bubble radius grows with the bin's sample count (sparse bins read as small, dense as large).
const rOf = (n: number) => 3 + Math.sqrt(n) * 1.4;

function Diagram({ points, year }: { points: ReliabilityPoint[]; year: 2018 | 2022 }) {
  const pts = points.filter((p) => p.year === year && p.meanPred != null && p.obsFreq != null);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Reliability diagram for the ${year} World Cup backtest: predicted probability on the x-axis, observed frequency on the y-axis, with the diagonal marking perfect calibration.`}
    >
      {/* gridlines */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={xOf(t)} y1={PAD.t} x2={xOf(t)} y2={PAD.t + PLOT} className="stroke-border" strokeWidth={0.5} />
          <line x1={PAD.l} y1={yOf(t)} x2={PAD.l + INNER} y2={yOf(t)} className="stroke-border" strokeWidth={0.5} />
          <text x={xOf(t)} y={SIZE - PAD.b + 12} textAnchor="middle" className="fill-muted text-[8px]">
            {t}
          </text>
          <text x={PAD.l - 6} y={yOf(t) + 3} textAnchor="end" className="fill-muted text-[8px]">
            {t}
          </text>
        </g>
      ))}

      {/* perfect-calibration diagonal */}
      <line
        x1={xOf(0)} y1={yOf(0)} x2={xOf(1)} y2={yOf(1)}
        className="stroke-border-strong" strokeWidth={1} strokeDasharray="4 3"
      />

      {/* points */}
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={xOf(p.meanPred as number)}
          cy={yOf(p.obsFreq as number)}
          r={rOf(p.n)}
          className={cn(FILL[p.klass], "opacity-70")}
          stroke="var(--surface)"
          strokeWidth={0.75}
        >
          <title>
            {`${CLASS_LABEL[p.klass]} · predicted ${(p.meanPred as number * 100).toFixed(0)}% → observed ${(p.obsFreq as number * 100).toFixed(0)}% (n=${p.n})`}
          </title>
        </circle>
      ))}

      {/* axis titles */}
      <text x={PAD.l + INNER / 2} y={SIZE - 2} textAnchor="middle" className="fill-secondary text-[9px] font-medium">
        Predicted probability
      </text>
      <text
        x={10} y={PAD.t + PLOT / 2}
        textAnchor="middle"
        transform={`rotate(-90 10 ${PAD.t + PLOT / 2})`}
        className="fill-secondary text-[9px] font-medium"
      >
        Observed frequency
      </text>
    </svg>
  );
}

export function ReliabilityChart({ points }: { points: ReliabilityPoint[] }) {
  const [year, setYear] = useState<2018 | 2022>(2022);
  const total = points
    .filter((p) => p.year === year && p.n)
    .reduce((s, p) => s + p.n, 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        {/* year segmented control */}
        <div className="inline-flex rounded-md border border-border bg-bg-subtle p-0.5">
          {YEARS.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              aria-pressed={year === y}
              className={cn(
                "tnum rounded px-3 py-1 text-xs font-semibold transition-colors",
                year === y ? "bg-surface text-fg shadow-[var(--shadow-card)]" : "text-muted hover:text-secondary"
              )}
            >
              WC {y}
            </button>
          ))}
        </div>
        <span className="tnum text-xs text-muted">{total} match-outcomes</span>
      </div>

      <div className="mx-auto max-w-md rounded-md border border-border bg-surface p-3">
        <Diagram points={points} year={year} />
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-secondary">
        {(Object.keys(CLASS_LABEL) as OutcomeClass[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-block h-2.5 w-2.5 rounded-full", DOT[k])} />
            {CLASS_LABEL[k]}
          </span>
        ))}
        <span className="ml-auto text-muted">Bubble size ∝ bin sample count · dashed line = perfect calibration</span>
      </div>
    </div>
  );
}

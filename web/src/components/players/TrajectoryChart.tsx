import { fmtMetric, matchLabel, metricLabel } from "@/lib/players";

export interface TrajectoryPoint {
  matchId: string;
  actual: number; // cumulative actual after this match
}

/** A lightweight inline-SVG cumulative trajectory: the season-total EXPECTED as a smooth straight
 *  ramp to the projection (dashed gold line + soft area), and the ACTUAL as a step line that accrues
 *  per played match. No chart lib; tokenized colors; no animation (static SVG is motion-safe by
 *  default). When there are no actuals yet, only the expected ramp draws, with an honest note. */
export function TrajectoryChart({
  metric,
  expectedTotal,
  points,
  matchesPlayed,
}: {
  metric: string;
  expectedTotal: number | null;
  points: TrajectoryPoint[];
  /** Total matches the trajectory is drawn across (so the expected ramp spans the same x as actuals). */
  matchesPlayed: number;
}) {
  const W = 480;
  const H = 160;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // x is the match index 0..steps; y is the cumulative value 0..max.
  const steps = Math.max(matchesPlayed, 1);
  const lastActual = points.length ? points[points.length - 1].actual : 0;
  const max = Math.max(expectedTotal ?? 0, lastActual, 1);

  const x = (i: number) => padL + (steps === 0 ? 0 : (i / steps) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  // expected ramp: from (0,0) to (steps, expectedTotal) when projected; the per-match pace is the
  // total spread evenly across the tournament length we draw (the played window).
  const expEnd = expectedTotal != null ? (expectedTotal / Math.max(steps, 1)) * steps : null;
  const expPath =
    expEnd != null ? `M ${x(0)} ${y(0)} L ${x(steps)} ${y(expEnd)}` : null;
  const expArea =
    expEnd != null
      ? `M ${x(0)} ${y(0)} L ${x(steps)} ${y(expEnd)} L ${x(steps)} ${y(0)} Z`
      : null;

  // actual step line: starts at 0, steps up at each played match to its cumulative total.
  const stepCmds: string[] = [`M ${x(0)} ${y(0)}`];
  let prev = 0;
  points.forEach((p, i) => {
    const xi = x(i + 1);
    stepCmds.push(`L ${x(i + 1)} ${y(prev)}`); // hold previous level to this match's x
    stepCmds.push(`L ${xi} ${y(p.actual)}`); // then step to the new cumulative level
    prev = p.actual;
  });
  const actualPath = points.length ? stepCmds.join(" ") : null;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-display text-sm font-semibold tracking-wide text-secondary uppercase">
          {metricLabel(metric)} trajectory
        </h3>
        <span className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-3 border-t-2 border-dashed border-gold" /> Expected
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-3 border-t-2 border-confident" /> Actual
          </span>
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
           aria-label={`Cumulative ${metricLabel(metric).toLowerCase()}: expected vs actual`}>
        {/* baseline + top gridline */}
        <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke="var(--border)" strokeWidth="1" />
        <line x1={padL} y1={y(max)} x2={W - padR} y2={y(max)} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4" />

        {expArea ? <path d={expArea} fill="var(--gold)" opacity="0.08" /> : null}
        {expPath ? (
          <path d={expPath} fill="none" stroke="var(--gold)" strokeWidth="2"
                strokeDasharray="5 4" strokeLinecap="round" />
        ) : null}
        {actualPath ? (
          <path d={actualPath} fill="none" stroke="var(--confident)" strokeWidth="2.5"
                strokeLinejoin="round" strokeLinecap="round" />
        ) : null}

        {/* actual dots at each played match */}
        {points.map((p, i) => (
          <circle key={p.matchId} cx={x(i + 1)} cy={y(p.actual)} r="3" fill="var(--confident)" />
        ))}

        {/* labels */}
        <text x={padL} y={H - 6} fontSize="9" fill="var(--muted)">Kickoff</text>
        <text x={W - padR} y={H - 6} fontSize="9" fill="var(--muted)" textAnchor="end">
          {points.length ? matchLabel(points[points.length - 1].matchId) : "Tournament"}
        </text>
      </svg>

      <div className="mt-1 flex items-baseline justify-between text-xs">
        <span className="text-muted">
          {points.length === 0
            ? "No matches played yet. Showing the projected pace only."
            : `Through ${points.length} ${points.length === 1 ? "match" : "matches"}`}
        </span>
        <span className="tnum text-secondary">
          {fmtMetric(lastActual)} actual{expectedTotal != null ? ` / ${fmtMetric(expectedTotal)} projected` : ""}
        </span>
      </div>
    </div>
  );
}

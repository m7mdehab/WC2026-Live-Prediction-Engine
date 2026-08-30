import { Card, CardHeader } from "@/components/ui/Card";
import { flagColor } from "@/lib/flagColors";
import { rawPct, simPct } from "@/lib/utils";
import type { WinProbPoint } from "@/lib/types";

// Wave 1.4 - one fixture's W/D/L across the model's published runs (the per-match sibling of the
// title-odds-over-time chart). Fixed height (zero-CLS), token-only colours (each win line in its
// nation's flag colour, the draw line neutral/dashed), honest 0-100% axis. Plain server component
// (no interactivity). Returns null when history is too thin to draw a trend (< 2 points); the caller
// simply omits the card in that case.
export function WinProbTrend({ teamA, teamB, points }: {
  teamA: string;
  teamB: string;
  points: WinProbPoint[];
}) {
  const pts = points.filter(
    (p) => p.p_team_a_win != null && p.p_draw != null && p.p_team_b_win != null);
  if (pts.length < 2) return null;

  const W = 600, H = 200, LX = 40, RX = W - 12, TY = 16, BY = H - 26;
  const plotW = RX - LX, plotH = BY - TY, n = pts.length;
  const x = (i: number) => LX + (i / (n - 1)) * plotW;
  const y = (p: number) => TY + (1 - Math.max(0, Math.min(1, p))) * plotH;
  const path = (get: (p: WinProbPoint) => number | null) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(get(p) ?? 0).toFixed(1)}`).join(" ");

  const colA = flagColor(teamA), colB = flagColor(teamB);
  const last = pts[pts.length - 1];

  return (
    <Card>
      <CardHeader title="Win probability over time" hint="across published runs" />
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" role="img"
        aria-label={`Win, draw and loss probability for ${teamA} versus ${teamB} across the model's published forecasts, from the fixture's first forecast to kickoff.`}>
        {[1, 0.75, 0.5, 0.25, 0].map((t) => (
          <g key={t}>
            <line x1={LX} x2={RX} y1={y(t)} y2={y(t)} stroke="var(--border-strong)"
              strokeWidth={1} strokeDasharray="2 4" opacity={0.25} />
            <text x={LX - 4} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--muted)" className="tnum">
              {/* raw-pct-ok: fixed axis gradation label (0/25/50/75/100), not an outcome probability */}
              {rawPct(t, 0)}
            </text>
          </g>
        ))}
        {/* draw first (neutral, dashed), then the two win lines on top in flag colours */}
        <path d={path((p) => p.p_draw)} fill="none" stroke="var(--muted)" strokeWidth={1.6}
          strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path((p) => p.p_team_a_win)} fill="none" stroke={colA} strokeWidth={2.4}
          strokeLinecap="round" strokeLinejoin="round" />
        <path d={path((p) => p.p_team_b_win)} fill="none" stroke={colB} strokeWidth={2.4}
          strokeLinecap="round" strokeLinejoin="round" />
        <text x={LX} y={BY + 18} textAnchor="start" fontSize={10} fill="var(--muted)">first forecast</text>
        <text x={RX} y={BY + 18} textAnchor="end" fontSize={10} fill="var(--muted)">latest</text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <LegendDot color={colA} label={teamA} value={simPct(last.p_team_a_win)} />
        <LegendDot color="var(--muted)" label="draw" value={simPct(last.p_draw)} />
        <LegendDot color={colB} label={teamB} value={simPct(last.p_team_b_win)} />
      </div>
      <p className="mt-1 text-xs text-secondary">
        Each point is a forecast published during the tournament; the series ends at kickoff and does not change afterward.
      </p>
    </Card>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-secondary">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="max-w-28 truncate text-fg">{label}</span>
      <span className="tnum text-muted">{value}</span>
    </span>
  );
}
